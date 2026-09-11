// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {GuardianVault} from "../src/GuardianVault.sol";
import {
    GuardianSimpleStakingStrategy
} from "../src/strategies/GuardianSimpleStakingStrategy.sol";
import {GuardianTestToken} from "../mocks/GuardianTestToken.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {GuardianRegistry} from "../src/guardianship/GuardianRegistry.sol";

/**
 * @title Deploy
 * @notice Phase 4 deployment of the Guardian bridge contract set.
 *
 * Wiring:
 *   GuardianTestToken (6 decimals, minted to deployer for the E2E)
 *       ^
 *   GuardianSimpleStakingStrategy (vault-set)
 *       ^
 *   GuardianVault (token-supported, strategy allowlisted, admin = deployer)
 *
 * Run:
 *   source .env
 *   forge script script/Deploy.s.sol:Deploy --rpc-url $SEPOLIA_RPC_URL \
 *       --broadcast --verify --etherscan-api-key $ETHERSCAN_API_KEY
 *
 * The deployer becomes the vault's ownable admin. After deployment record the
 * emitted addresses in security-layer/config/contracts/sepolia.json (backend
 * registry format: chainId + contracts[{name, address, decimals}]).
 */
contract Deploy is Script {
    uint8 constant TOKEN_DECIMALS = 6;
    uint256 constant INITIAL_SUPPLY = 25_000_000e6; // 25M gTEST
    uint256 constant E2E_FUNDING = 100_000e6; // 100k gTEST for the demo wallet

    function run() public {
        uint256 deployer = vm.envUint("PRIVATE_KEY");
        address deployerAddr = vm.addr(deployer);
        vm.startBroadcast(deployer);

        // --- 1. test asset (USDC-style 6 decimals) ----------------------
        GuardianTestToken token = new GuardianTestToken(
            TOKEN_DECIMALS,
            INITIAL_SUPPLY
        );

        // --- 2. staking strategy ------------------------------------------
        GuardianSimpleStakingStrategy strategy = new GuardianSimpleStakingStrategy();

        // --- 3. vault ------------------------------------------------------
        GuardianVault vault = new GuardianVault(
            IERC20(address(token)),
            "Guardian USDC Share",
            "gUSDC"
        );

        // --- 4. wiring ------------------------------------------------------
        strategy.setVault(address(vault));
        vault.setTokenSupported(address(token), true);
        vault.setStrategy(address(strategy));

        // --- 5. fund the demo wallet for the wallet-signed E2E --------------
        token.mint(deployerAddr, E2E_FUNDING);

        // --- 6. on-chain discovery registry -----------------------------------
        // Self-serve index that lets any project register its strategy+vault+
        // token. Registration is a CLAIM, not trust — the backend re-validates
        // every entry against the chain before it can rank it (filter-for-web3).
        GuardianRegistry registry = new GuardianRegistry();

        vm.stopBroadcast();

        // --- summary ---------------------------------------------------------
        console2.log("GuardianTestToken", address(token));
        console2.log("GuardianSimpleStakingStrategy", address(strategy));
        console2.log("GuardianVault", address(vault));
        console2.log("GuardianRegistry", address(registry));
        console2.log("token supported", vault.supportedTokens(address(token)));
        console2.log("vault strategy", vault.strategy());
        console2.log("deployer (admin + E2E funding)", deployerAddr);
        console2.log("gTEST decimals", uint256(token.decimals()));
        console2.log("deployer gTEST balance", token.balanceOf(deployerAddr));
        console2.log("vault paused", vault.paused());
    }
}