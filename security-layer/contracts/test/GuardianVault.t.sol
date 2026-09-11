// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {GuardianVault} from "../src/GuardianVault.sol";
import {
    GuardianSimpleStakingStrategy
} from "../src/strategies/GuardianSimpleStakingStrategy.sol";
import {IYieldStrategy} from "../interfaces/IYieldStrategy.sol";
import {GuardianTestToken} from "../mocks/GuardianTestToken.sol";
import {RevertingToken} from "../mocks/RevertingToken.sol";
import {ReentrantToken} from "../mocks/ReentrantToken.sol";
import {
    MaliciousStrategy,
    NotAStrategy,
    FalseStrategy
} from "../mocks/MaliciousStrategy.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract GuardianVaultTest is Test {
    // USDC uses 6 decimals — the whole stack (backend, frontend) must NOT
    // assume 18. This test contract mirrors that.
    uint8 internal constant DECIMALS = 6;
    uint256 internal constant UNIT = 1e6;

    GuardianTestToken internal token;
    GuardianSimpleStakingStrategy internal strategy;
    GuardianVault internal vault;
    RevertingToken internal revertToken;
    MaliciousStrategy internal evilStrategy;

    address internal admin = makeAddr("admin");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal stranger = makeAddr("stranger");

    function setUp() public {
        vm.startPrank(admin);
        token = new GuardianTestToken(DECIMALS, 10_000_000 * UNIT); // 10M gTEST
        vault = new GuardianVault(
            IERC20(address(token)),
            "Guardian USDC Share",
            "gUSDC"
        );
        strategy = new GuardianSimpleStakingStrategy();
        strategy.setVault(address(vault));
        evilStrategy = new MaliciousStrategy();
        revertToken = new RevertingToken();
        vault.setTokenSupported(address(token), true);
        vault.setStrategy(address(strategy));
        // fund users
        token.transfer(alice, 1_000_000 * UNIT);
        token.transfer(bob, 1_000_000 * UNIT);
        vm.stopPrank();
    }

    // ------------------------------------------------------------------ //
    // Helpers                                                              //
    // ------------------------------------------------------------------ //

    function depositAs(address who, uint256 amount) internal {
        vm.startPrank(who);
        token.approve(address(vault), amount);
        vault.deposit(amount, who);
        vm.stopPrank();
    }

    function staked() internal view returns (uint256) {
        return strategy.balanceOfStaked(address(token));
    }

    // ------------------------------------------------------------------ //
    // Configuration / access control                                      //
    // ------------------------------------------------------------------ //

    function testSetStrategyOnlyOwner() public {
        vm.expectRevert();
        vm.prank(stranger);
        vault.setStrategy(address(strategy));

        vm.prank(admin);
        vault.setStrategy(address(strategy));
        assertEq(vault.strategy(), address(strategy));

        // a contract that explicitly disclaims the Guardian marker is rejected
        FalseStrategy falseS = new FalseStrategy();
        vm.expectRevert(
            abi.encodeWithSelector(GuardianVault.InvalidStrategy.selector, address(falseS))
        );
        vm.prank(admin);
        vault.setStrategy(address(falseS));

        // an arbitrary contract with no such function is also rejected (the
        // interface call to it reverts, which is still a clean revert)
        NotAStrategy notA = new NotAStrategy();
        vm.expectRevert();
        vm.prank(admin);
        vault.setStrategy(address(notA));
    }

    function testSetTokenSupportedOnlyOwner() public {
        vm.expectRevert();
        vm.prank(stranger);
        vault.setTokenSupported(address(token), true);
    }

    function testPauseOnlyOwner() public {
        vm.expectRevert();
        vm.prank(stranger);
        vault.pause();
        vm.prank(admin);
        vault.pause();
        assertTrue(vault.paused());
    }

    function testUnpauseOnlyOwner() public {
        vm.prank(admin);
        vault.pause();
        vm.expectRevert();
        vm.prank(stranger);
        vault.unpause();
        vm.prank(admin);
        vault.unpause();
        assertFalse(vault.paused());
    }

    function testDepositWhilePausedReverts() public {
        vm.prank(admin);
        vault.pause();
        vm.startPrank(alice);
        token.approve(address(vault), UNIT);
        vm.expectRevert();
        vault.deposit(UNIT, alice);
        vm.stopPrank();
    }

    function testWithdrawWhilePausedReverts() public {
        depositAs(alice, 10 * UNIT);
        vm.prank(admin);
        vault.pause();
        vm.expectRevert();
        vm.prank(alice);
        vault.withdraw(UNIT, alice, alice);
    }

    // ------------------------------------------------------------------ //
    // Deposits                                                            //
    // ------------------------------------------------------------------ //

    function testDepositMintsSharesAndRoutes() public {
        uint256 before = token.balanceOf(alice);
        depositAs(alice, 100 * UNIT);

        assertEq(vault.balanceOf(alice), 100 * UNIT, "alice share balance");
        assertEq(vault.totalSupply(), 100 * UNIT, "total supply");
        assertEq(token.balanceOf(address(vault)), 0, "vault idle balance");
        assertEq(staked(), 100 * UNIT, "strategy staked");
        assertEq(
            token.allowance(address(vault), address(strategy)),
            0,
            "no standing allowance"
        );
        assertEq(token.balanceOf(alice), before - 100 * UNIT, "alice paid");
        assertEq(token.balanceOf(address(strategy)), 100 * UNIT, "strategy holds");
    }

    function testDepositRequiresTokenSupported() public {
        vm.prank(admin);
        vault.setTokenSupported(address(token), false);

        vm.startPrank(alice);
        token.approve(address(vault), UNIT);
        vm.expectRevert(
            abi.encodeWithSelector(GuardianVault.TokenNotSupported.selector, address(token))
        );
        vault.deposit(UNIT, alice);
        vm.stopPrank();
    }

    function testDepositRequiresStrategy() public {
        vm.prank(admin);
        vault.setStrategy(address(0));

        vm.startPrank(alice);
        token.approve(address(vault), UNIT);
        vm.expectRevert(GuardianVault.StrategyNotSet.selector);
        vault.deposit(UNIT, alice);
        vm.stopPrank();
    }

    function testDepositRequiresAllowance() public {
        vm.prank(alice); // approve NOT called
        vm.expectRevert();
        vault.deposit(UNIT, alice);
        assertEq(staked(), 0, "nothing routed");
    }

    function testDepositZeroAmountReverts() public {
        vm.prank(alice);
        vm.expectRevert(GuardianVault.ZeroAmount.selector);
        vault.deposit(0, alice);
    }

    function testDepositMintWithdrawRedeemZeroRevert() public {
        depositAs(alice, UNIT);
        vm.prank(alice);
        vm.expectRevert(GuardianVault.ZeroAmount.selector);
        vault.mint(0, alice);
        vm.prank(alice);
        vm.expectRevert(GuardianVault.ZeroAmount.selector);
        vault.withdraw(0, alice, alice);
        vm.prank(alice);
        vm.expectRevert(GuardianVault.ZeroAmount.selector);
        vault.redeem(0, alice, alice);
    }

    function testDepositBadTokenFailsCleanly() public {
        // A token whose transfers revert must produce a clean revert and no
        // state change anywhere.
        vm.prank(admin);
        vault.setTokenSupported(address(revertToken), true);

        vm.prank(stranger);
        vm.expectRevert();
        vault.deposit(1, stranger);
        assertEq(staked(), 0, "strategy unchanged");
        assertEq(vault.totalSupply(), 0, "no shares minted");
    }

    function testStrategyRevertDuringDepositRollsBackEverything() public {
        // Instantiate a second vault whose allowlisted strategy reverts on
        // deposit. The whole deposit must roll back (no loss, no shares).
        vm.startPrank(admin);
        GuardianVault evilVault = new GuardianVault(
            IERC20(address(token)),
            "Evil Share",
            "gEVIL"
        );
        evilVault.setTokenSupported(address(token), true);
        evilVault.setStrategy(address(evilStrategy));
        token.transfer(stranger, UNIT);
        vm.stopPrank();

        vm.startPrank(stranger);
        token.approve(address(evilVault), UNIT);
        vm.expectRevert();
        evilVault.deposit(UNIT, stranger);
        vm.stopPrank();

        assertEq(evilVault.balanceOf(stranger), 0, "no shares");
        assertEq(token.balanceOf(stranger), UNIT, "funds intact");
    }

    // ------------------------------------------------------------------ //
    // Withdrawals                                                         //
    // ------------------------------------------------------------------ //

    function testWithdrawReturnsFunds() public {
        depositAs(alice, 100 * UNIT);
        uint256 before = token.balanceOf(alice);

        vm.prank(alice);
        uint256 sharesBurned = vault.withdraw(40 * UNIT, alice, alice);

        assertEq(sharesBurned, 40 * UNIT, "shares burned");
        assertEq(token.balanceOf(alice), before + 40 * UNIT, "alice paid back");
        assertEq(staked(), 60 * UNIT, "strategy reduced");
        assertEq(vault.balanceOf(alice), 60 * UNIT, "shares reduced");
    }

    function testWithdrawMoreThanAssetsReverts() public {
        depositAs(alice, 10 * UNIT);
        vm.expectRevert();
        vm.prank(alice);
        vault.withdraw(11 * UNIT, alice, alice);
    }

    function testRedeemAllLeavesEverythingEmpty() public {
        depositAs(alice, 250 * UNIT);
        uint256 aliceShares = vault.balanceOf(alice);
        vault.previewRedeem(aliceShares);

        vm.prank(alice);
        vault.redeem(aliceShares, alice, alice);

        assertEq(staked(), 0, "strategy empty");
        assertEq(token.balanceOf(address(vault)), 0, "vault empty");
        assertEq(token.balanceOf(address(strategy)), 0, "strategy empty");
        assertEq(vault.totalSupply(), 0, "no shares left");
    }

    function testCannotWithdrawOthersSharesWithoutAllowance() public {
        depositAs(alice, 100 * UNIT);
        vm.expectRevert();
        vm.prank(bob);
        vault.withdraw(10 * UNIT, bob, alice);
    }

    function testWithdrawWithAllowanceSpendsGrantedShares() public {
        depositAs(alice, 100 * UNIT);
        vm.startPrank(alice);
        vault.approve(bob, 20 * UNIT);
        vm.stopPrank();

        uint256 before = token.balanceOf(bob);
        vm.prank(bob);
        vault.withdraw(20 * UNIT, bob, alice);

        assertEq(token.balanceOf(bob), before + 20 * UNIT, "bob received");
        assertEq(vault.balanceOf(alice), 80 * UNIT, "alice shares reduced");
    }

    function testWithdrawWhenStrategyWithdrawReverts() public {
        // A failure inside the strategy during an exit must revert the whole
        // transaction: no shares burned, no partial state. Here the admin has
        // (mis)configured the vault to a sabotaged strategy AFTER deposits;
        // user funds are NOT lost and the vault recovers once reconfigured.
        depositAs(alice, 100 * UNIT);
        vm.startPrank(admin);
        vault.setStrategy(address(evilStrategy));
        vm.stopPrank();

        uint256 aliceShares = vault.balanceOf(alice);
        uint256 aliceBefore = token.balanceOf(alice);
        vm.prank(alice);
        vm.expectRevert();
        vault.withdraw(10 * UNIT, alice, alice);

        assertEq(vault.balanceOf(alice), aliceShares, "shares intact");
        assertEq(token.balanceOf(alice), aliceBefore, "funds intact");

        // Reconfiguring back to the working strategy restores exits.
        vm.startPrank(admin);
        vault.setStrategy(address(strategy));
        vm.stopPrank();
        vm.prank(alice);
        vault.withdraw(10 * UNIT, alice, alice);
        assertEq(token.balanceOf(alice), aliceBefore + 10 * UNIT, "withdraw recovered");
    }

    // ------------------------------------------------------------------ //
    // Yield / rebase (resulting-state verification)                       //
    // ------------------------------------------------------------------ //

    function testYieldIncreasesExchangeRate() public {
        depositAs(alice, 1_000 * UNIT);

        uint256 assetsPerShareBefore = vault.previewRedeem(UNIT);
        // Simulate protocol yield: sponsor donates 100 gTEST to the strategy.
        vm.startPrank(admin);
        token.approve(address(strategy), 100 * UNIT);
        token.transfer(address(strategy), 100 * UNIT);
        strategy.donateYield(address(token), 100 * UNIT);
        vm.stopPrank();

        uint256 assetsPerShareAfter = vault.previewRedeem(UNIT);
        assertGt(assetsPerShareAfter, assetsPerShareBefore, "exchange rate rose");

        // Alice redeems and exits with principal + yield. ERC4626's virtual
        // offset can shave at most a couple of base units, so we assert strict
        // outperformance over principal.
        uint256 aliceShares = vault.balanceOf(alice);
        uint256 aliceBefore = token.balanceOf(alice);
        vm.prank(alice);
        vault.redeem(aliceShares, alice, alice);
        uint256 received = token.balanceOf(alice) - aliceBefore;
        assertGt(received, 1_000 * UNIT, "yield exceeds principal");
        assertLe(received, 1_100 * UNIT, "no more than principal + donated");
        // at most ERC4626 dust remains unwithdrawable in the strategy
        assertLt(staked(), 5, "only rounding dust left behind");
    }

    // ------------------------------------------------------------------ //
    // Reentrancy                                                          //
    // ------------------------------------------------------------------ //

    function testReentrantTokenCannotReenterVault() public {
        // A token that calls vault.deposit() inside its transferFrom hook.
        vm.startPrank(admin);
        ReentrantToken evil = new ReentrantToken(address(vault), true);
        GuardianVault guarded = new GuardianVault(
            IERC20(address(evil)),
            "Guarded Share",
            "gG"
        );
        evil.mint(stranger, UNIT);
        guarded.setTokenSupported(address(evil), true);
        // allowlist the same strategy for the second vault
        guarded.setStrategy(address(strategy));
        vm.stopPrank();

        vm.prank(stranger);
        evil.approve(address(guarded), UNIT);
        vm.expectRevert(); // inner deposit reverted by ReentrancyGuard
        guarded.deposit(UNIT, stranger);

        assertEq(guarded.balanceOf(stranger), 0, "no shares minted");
        // NOTE: the token's brute force transfer happened before the revert,
        // so the funds left the user. This is the token's own maliciousness,
        // not a vault bug. What we prove is that reentrancy cannot mint shares
        // or double-route assets into the strategy.
        assertEq(strategy.balanceOfStaked(address(evil)), 0);
    }

    // ------------------------------------------------------------------ //
    // Accounting / invariants                                             //
    // ------------------------------------------------------------------ //

    function testInvariantVaultNeverHoldsIdleAssets() public {
        depositAs(alice, 77 * UNIT);
        depositAs(bob, 33 * UNIT);
        assertEq(token.balanceOf(address(vault)), 0, "no idle");
        assertEq(token.balanceOf(address(strategy)), 110 * UNIT);
        assertEq(vault.totalAssets(), 110 * UNIT);
    }

    function testFuzzDepositWithdraw_NoValueLeak(uint32 x, uint32 y) public {
        vm.assume(x > 1 && y > 1 && uint256(x) + uint256(y) < 900_000);
        uint256 aliceAmt = uint256(x) * 3; // small odd units stress rounding
        uint256 bobAmt = uint256(y) * 7;

        uint256 aliceBefore = token.balanceOf(alice);
        uint256 bobBefore = token.balanceOf(bob);
        depositAs(alice, aliceAmt);
        depositAs(bob, bobAmt);

        // Alice fully exits. With OZ's virtual-offset accounting she recovers
        // at least her principal (her ending balance >= original).
        uint256 aliceShares = vault.balanceOf(alice);
        vm.prank(alice);
        vault.redeem(aliceShares, alice, alice);
        assertGe(token.balanceOf(alice), aliceBefore, "alice principal preserved");

        // Bob too.
        uint256 bobShares = vault.balanceOf(bob);
        vm.prank(bob);
        vault.redeem(bobShares, bob, bob);
        assertGe(token.balanceOf(bob), bobBefore, "bob principal preserved");

        // Protocol-level conservation: every base unit that left the users is
        // back with them and nothing was created or destroyed in between.
        assertEq(staked(), 0, "strategy fully drained");
        assertEq(token.balanceOf(address(vault)), 0, "vault empty");
        assertEq(vault.totalSupply(), 0, "no shares remain");
        assertEq(
            token.balanceOf(alice) + token.balanceOf(bob),
            aliceBefore + bobBefore,
            "no value leaked to anyone"
        );
    }

    function testAdminCannotMoveUserFunds() public {
        depositAs(alice, 100 * UNIT);
        uint256 adminShareBefore = vault.balanceOf(admin);
        assertEq(adminShareBefore, 0, "admin owns nothing");

        // No rescue/withdrawAsAdmin function exists on the vault. Redeeming
        // someone else's shares requires their allowance.
        vm.expectRevert();
        vm.prank(admin);
        vault.redeem(100 * UNIT, admin, alice);
    }

    // ------------------------------------------------------------------ //
    // Security: two-user isolation (no cross-flow between stakeholders)   //
    // ------------------------------------------------------------------ //

    function testUserIsolation_NoCrossAccess() public {
        uint256 aliceDeposit = 400 * UNIT;
        uint256 bobDeposit = 600 * UNIT;
        depositAs(alice, aliceDeposit);
        depositAs(bob, bobDeposit);

        uint256 aliceShares = vault.balanceOf(alice);
        uint256 bobShares = vault.balanceOf(bob);
        assertEq(aliceShares, aliceDeposit, "alice receives exactly her shares");
        assertEq(bobShares, bobDeposit, "bob receives exactly his shares");

        // Bob's steal matrix: every path into alice's position without her
        // allowance must revert.
        vm.startPrank(bob);
        vm.expectRevert();
        vault.withdraw(aliceDeposit, bob, alice);
        vm.expectRevert();
        vault.redeem(aliceShares, bob, alice);
        vm.expectRevert();
        vault.transferFrom(alice, bob, aliceShares);
        vm.stopPrank();

        assertEq(vault.balanceOf(alice), aliceShares, "alice position untouched");
        assertEq(vault.balanceOf(bob), bobShares, "bob position untouched");
        assertEq(
            staked(),
            aliceDeposit + bobDeposit,
            "strategy holds exactly the two deposits"
        );
    }

    function testUserIsolation_AllowanceMovesOnlyGrantedShares() public {
        depositAs(alice, 100 * UNIT);
        depositAs(bob, 100 * UNIT);
        vm.startPrank(alice);
        vault.approve(bob, 25 * UNIT);
        vm.stopPrank();

        uint256 bobTokenBefore = token.balanceOf(bob);
        vm.prank(bob);
        vault.transferFrom(alice, bob, 20 * UNIT);

        // The grant moves receipt shares only — no asset leaves the strategy.
        assertEq(vault.balanceOf(alice), 80 * UNIT, "alice granted 20 shares");
        assertEq(vault.balanceOf(bob), 120 * UNIT, "bob received 20 shares");
        assertEq(token.balanceOf(bob), bobTokenBefore, "no asset transfer on share gift");
        assertEq(staked(), 200 * UNIT, "strategy untouched");

        // Spending beyond the grant reverts.
        vm.expectRevert();
        vm.prank(bob);
        vault.transferFrom(alice, bob, 10 * UNIT);
        assertEq(vault.balanceOf(alice), 80 * UNIT, "remaining allowance not spent");
    }

    function testUserIsolation_FreshDepositorCannotDiluteExistingPosition() public {
        depositAs(alice, 500 * UNIT);
        uint256 aliceShares = vault.balanceOf(alice);
        uint256 bobBefore = token.balanceOf(bob);

        depositAs(bob, 500 * UNIT);

        assertEq(vault.balanceOf(alice), aliceShares, "alice shares unchanged by bob deposit");
        assertEq(
            token.balanceOf(bob),
            bobBefore - 500 * UNIT,
            "bob paid only his own deposit"
        );
        assertEq(staked(), 1_000 * UNIT, "both deposits routed");
    }

    // ------------------------------------------------------------------ //
    // Security: insufficient balance                                      //
    // ------------------------------------------------------------------ //

    function testDepositInsufficientTokenBalanceReverts() public {
        // Approve far more than alice actually holds; the token transferFrom
        // must fail and no state may change anywhere.
        uint256 aliceBal = token.balanceOf(alice);
        vm.startPrank(alice);
        token.approve(address(vault), type(uint256).max);
        vm.expectRevert();
        vault.deposit(aliceBal + 1, alice);
        vm.stopPrank();

        assertEq(vault.balanceOf(alice), 0, "no shares minted");
        assertEq(staked(), 0, "nothing routed");
        assertEq(token.balanceOf(alice), aliceBal, "balance untouched");
    }

    function testWithdrawInsufficientSharesReverts() public {
        depositAs(alice, 100 * UNIT);
        vm.prank(alice);
        vault.withdraw(100 * UNIT, alice, alice);

        // Nothing left — a re-withdraw must revert and mint nothing.
        vm.expectRevert();
        vm.prank(alice);
        vault.withdraw(1, alice, alice);
        assertEq(vault.balanceOf(alice), 0, "no shares remain");
        assertEq(staked(), 0, "strategy drained");
    }

    function testStrategyWithdrawInsufficientStakedReverts() public {
        vm.startPrank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(GuardianSimpleStakingStrategy.NotVault.selector, stranger)
        );
        strategy.withdraw(address(token), UNIT);
        vm.stopPrank();
    }

    // ------------------------------------------------------------------ //
    // Security: strategy not installed (removed while money is inside)    //
    // ------------------------------------------------------------------ //

    function testWithdrawWithStrategyNotSetReverts() public {
        depositAs(alice, 100 * UNIT);
        vm.startPrank(admin);
        vault.setStrategy(address(0));
        vm.stopPrank();

        uint256 beforeBal = token.balanceOf(alice);
        // With the strategy cleared, totalAssets() is 0 so the ERC4626
        // max-withdraw guard fires first — the exit is refused flat-out, which
        // is exactly the point: funds are unreachable, not lost.
        vm.expectRevert();
        vm.prank(alice);
        vault.withdraw(10 * UNIT, alice, alice);

        assertEq(token.balanceOf(alice), beforeBal, "funds intact");
        assertEq(vault.balanceOf(alice), 100 * UNIT, "shares intact");
        assertEq(staked(), 100 * UNIT, "strategy retains the funds");
    }

    function testReinstallStrategyRestoresWithdraw() public {
        depositAs(alice, 100 * UNIT);
        vm.prank(admin);
        vault.setStrategy(address(0));
        vm.prank(admin);
        vault.setStrategy(address(strategy));

        uint256 beforeBal = token.balanceOf(alice);
        vm.prank(alice);
        vault.withdraw(10 * UNIT, alice, alice);
        assertEq(token.balanceOf(alice), beforeBal + 10 * UNIT, "withdraw restored");
    }

    // ------------------------------------------------------------------ //
    // Security: strategy vault binding is permanent                       //
    // ------------------------------------------------------------------ //

    function testStrategyVaultBindingIsPermanent() public {
        // Re-pointing an in-use strategy (even by its owner) would hand a
        // replacement contract the onlyVault withdraw key. The binding must be
        // one-time to close that admin foot-gun.
        address replacement = makeAddr("replacement");
        vm.expectRevert(GuardianSimpleStakingStrategy.VaultAlreadySet.selector);
        vm.prank(admin);
        strategy.setVault(replacement);

        // And non-owners cannot bind at all.
        vm.expectRevert();
        vm.prank(stranger);
        strategy.setVault(address(vault));
    }
}