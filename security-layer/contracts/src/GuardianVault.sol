// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {IERC20, SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IYieldStrategy} from "../interfaces/IYieldStrategy.sol";

/**
 * @title GuardianVault
 * @notice AI Guardian's controlled on-chain execution boundary (Phase 4).
 *
 * Role of the contract:
 *   - Receives one supported ERC-20 asset (the vault's `asset()`).
 *   - Routes deposits to exactly ONE allowlisted strategy contract through a
 *     single fixed call (IYieldStrategy.deposit). It can invest in no other
 *     contract and can execute no other operation.
 *   - Computes per-user balances with ERC-4626 share accounting (a user's
 *     ownership = their receipt shares / total supply). Funds never sit in an
 *     anonymous pool balance owned by no one.
 *   - Returns funds exclusively through `withdraw`/`redeem` to the owner of
 *     the burnt shares. There is NO admin withdrawal and NO rescue function
 *     that can move user funds.
 *
 * Explicitly NOT included (by design):
 *   - arbitrary target / calldata execution
 *   - delegatecall
 *   - arbitrary token approvals beyond the exact per-call strategy allowance
 *   - any function that lets the admin or the backend move user funds
 *   - unlimited allowances
 *
 * Security model:
 *   - Ownable admin may only: set/clear the strategy allowlist, toggle token
 *     support, pause/unpause. The admin cannot withdraw user assets.
 *   - Pausable freezes deposit/withdraw/mint/redeem in an emergency.
 *   - ERC-4626 (OpenZeppelin v5) provides inflation-protected share math.
 *   - ReentrancyGuard wraps the four money functions.
 *   - Every depositor's claim is their receipt token balance; the strategy
 *     balance is only ever convertible to assets via the same share math.
 *
 * Testnet note: this contract itself is deployment-agnostic. On Sepolia it is
 * deployed against the audited testnet strategy + test token for Phase 4
 * validation. Pointing it at production strategy adapters is configuration.
 */
contract GuardianVault is ERC4626, Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /* ------------------------------------------------------------------ */
    /* Storage                                                             */
    /* ------------------------------------------------------------------ */

    /// The single protocol contract the vault is currently allowed to call.
    address public strategy;

    /// Supported ERC-20 entry assets. Deposit/withdraw paths revert unless
    /// `asset()` is supported (the allowance is defense-in-depth; deposits
    /// always use `asset()` regardless of frontend input).
    mapping(address token => bool supported) public supportedTokens;

    /* ------------------------------------------------------------------ */
    /* Errors                                                              */
    /* ------------------------------------------------------------------ */

    error StrategyNotSet();
    error InvalidStrategy(address candidate);
    error TokenNotSupported(address token);
    error ZeroAmount();

    /* ------------------------------------------------------------------ */
    /* Events                                                              */
    /* ------------------------------------------------------------------ */

    event StrategyUpdated(address indexed strategy, bool active);
    event TokenSupportChanged(address indexed token, bool supported);
    event StrategyRouted(
        address indexed strategy,
        address indexed token,
        uint256 assets,
        uint256 shares
    );
    event StrategyWithdrawn(
        address indexed strategy,
        address indexed token,
        uint256 assets,
        uint256 shares,
        address indexed receiver
    );

    /* ------------------------------------------------------------------ */
    /* Constructor                                                         */
    /* ------------------------------------------------------------------ */

    constructor(
        IERC20 asset_,
        string memory name_,
        string memory symbol_
    ) ERC4626(asset_) ERC20(name_, symbol_) Ownable(msg.sender) {}

    /* ------------------------------------------------------------------ */
    /* Admin — configuration only, never asset movement                    */
    /* ------------------------------------------------------------------ */

    /**
     * @notice Set the allowlisted strategy (or clear it with address(0)).
     *         Only contracts that identify themselves as Guardian strategies
     *         can be allowlisted — this prevents pointing the vault at an
     *         arbitrary contract.
     */
    function setStrategy(address strategy_) external onlyOwner {
        if (strategy_ != address(0) && !IYieldStrategy(strategy_).isGuardianStrategy()) {
            revert InvalidStrategy(strategy_);
        }
        strategy = strategy_;
        emit StrategyUpdated(strategy_, strategy_ != address(0));
    }

    /**
     * @notice Toggle whether an ERC-20 may be used as the operational asset.
     *         The vault's `asset()` must be supported before money functions
     *         are allowed to run.
     */
    function setTokenSupported(address token_, bool supported_) external onlyOwner {
        supportedTokens[token_] = supported_;
        emit TokenSupportChanged(token_, supported_);
    }

    /* ------------------------------------------------------------------ */
    /* Pause / unpause (emergency stop)                                    */
    /* ------------------------------------------------------------------ */

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /* ------------------------------------------------------------------ */
    /* ERC-4626 overrides                                                  */
    /* ------------------------------------------------------------------ */

    function totalAssets() public view override returns (uint256) {
        if (strategy == address(0)) return 0;
        return IYieldStrategy(strategy).balanceOfStaked(asset());
    }

    function deposit(uint256 assets, address receiver)
        public
        override
        nonReentrant
        whenNotPaused
        returns (uint256)
    {
        if (assets == 0) revert ZeroAmount();
        return super.deposit(assets, receiver);
    }

    function mint(uint256 shares, address receiver)
        public
        override
        nonReentrant
        whenNotPaused
        returns (uint256)
    {
        if (shares == 0) revert ZeroAmount();
        return super.mint(shares, receiver);
    }

    function withdraw(uint256 assets, address receiver, address owner)
        public
        override
        nonReentrant
        whenNotPaused
        returns (uint256)
    {
        if (assets == 0) revert ZeroAmount();
        return super.withdraw(assets, receiver, owner);
    }

    function redeem(uint256 shares, address receiver, address owner)
        public
        override
        nonReentrant
        whenNotPaused
        returns (uint256)
    {
        if (shares == 0) revert ZeroAmount();
        return super.redeem(shares, receiver, owner);
    }

    /**
     * @dev Pull the asset from the depositor, mint their receipt shares, then
     *      invest the exact amount into the allowlisted strategy. If the
     *      strategy call reverts the entire transaction reverts and nothing is
     *      lost. The strategy allowance is set to exactly `assets` for the
     *      call and then reset to zero, so the vault never leaves a standing
     *      allowance to anyone.
     */
    function _deposit(
        address caller,
        address receiver,
        uint256 assets,
        uint256 shares
    ) internal override whenNotPaused {
        if (!supportedTokens[asset()]) revert TokenNotSupported(asset());
        if (strategy == address(0)) revert StrategyNotSet();

        super._deposit(caller, receiver, assets, shares);

        IERC20(asset()).safeIncreaseAllowance(strategy, assets);
        try IYieldStrategy(strategy).deposit(asset(), assets) {
            IERC20(asset()).forceApprove(strategy, 0);
        } catch {
            // Revert the allowance change and the entire transaction. The
            // depositor's assets and newly minted shares are rolled back.
            IERC20(asset()).forceApprove(strategy, 0);
            revert("GuardianVault: strategy deposit failed");
        }
        emit StrategyRouted(strategy, asset(), assets, shares);
    }

    /**
     * @dev Pull the assets out of the strategy first, then burn the receipt
     *      shares and send the assets to the receiver. A failed strategy
     *      call reverts the whole transaction (no funds lost, no partial
     *      state).
     */
    function _withdraw(
        address caller,
        address receiver,
        address owner,
        uint256 assets,
        uint256 shares
    ) internal override whenNotPaused {
        if (!supportedTokens[asset()]) revert TokenNotSupported(asset());
        if (strategy == address(0)) revert StrategyNotSet();

        IYieldStrategy(strategy).withdraw(asset(), assets);
        super._withdraw(caller, receiver, owner, assets, shares);
        emit StrategyWithdrawn(strategy, asset(), assets, shares, receiver);
    }
}