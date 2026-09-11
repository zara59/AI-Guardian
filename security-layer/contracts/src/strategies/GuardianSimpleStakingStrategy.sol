// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IYieldStrategy} from "../../interfaces/IYieldStrategy.sol";

/**
 * @title GuardianSimpleStakingStrategy
 * @notice AI Guardian's TESTNET strategy contract for Phase 4 validation.
 *
 * This is a deliberately simple, single-purpose contract that demonstrates
 * the controlled execution bridge end-to-end on a testnet:
 *
 *   user wallet → GuardianVault → GuardianSimpleStakingStrategy → state
 *
 * Behaviour:
 *   - Only the configured vault may deposit/withdraw.
 *   - It holds the token and keeps an aggregate `staked` ledger.
 *   - The owner (deployer) may `donateYield` extra tokens to simulate protocol
 *     yield/rewards; the vault's exchange rate (shares → assets) then rises,
 *     which the application reads back to verify "resulting state".
 *   - There is NO ability to move funds to anyone other than the vault, and no
 *     arbitrary calldata. `withdraw` pays the vault exactly `amount`.
 *
 * This is NOT a production yield protocol. It exists so the Phase 4 bridge can
 * be validated with real on-chain value movement on Sepolia without depending
 * on third-party testnet deployments. Production integrations (e.g. Aave,
 * Lido) implement IYieldStrategy and are allowlisted by configuration.
 */
contract GuardianSimpleStakingStrategy is IYieldStrategy, Ownable {
    using SafeERC20 for IERC20;

    address public vault;

    /// Aggregated staked amount per token (source of truth for the vault's
    /// `totalAssets`). Individual ownership lives in the vault's ERC-4626
    /// share ledger.
    mapping(address token => uint256 amount) public staked;

    event Deposited(address indexed token, uint256 amount);
    event Withdrawn(address indexed token, uint256 amount);
    event YieldDonated(address indexed token, uint256 amount);
    event VaultChanged(address indexed vault);

    error NotVault(address sender);
    error ZeroAddress();
    error VaultAlreadySet();

    modifier onlyVault() {
        if (msg.sender != vault) revert NotVault(msg.sender);
        _;
    }

    constructor() Ownable(msg.sender) {}

    /// Binds this strategy to its vault exactly once. Re-pointing an in-use
    /// strategy (even by the owner) would let a replacement contract call
    /// withdraw() and drain the users' staked assets, so the binding is
    /// permanent after the first non-zero assignment.
    function setVault(address vault_) external onlyOwner {
        if (vault_ == address(0)) revert ZeroAddress();
        if (vault != address(0)) revert VaultAlreadySet();
        vault = vault_;
        emit VaultChanged(vault_);
    }

    /// Determines who the strategy will lend the token to (the vault).
    function depositor() external view returns (address) {
        return vault;
    }

    function deposit(address token, uint256 amount)
        external
        onlyVault
        returns (uint256)
    {
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        staked[token] += amount;
        emit Deposited(token, amount);
        return amount;
    }

    function withdraw(address token, uint256 amount)
        external
        onlyVault
        returns (uint256)
    {
        if (staked[token] < amount) {
            revert NotVault(address(0)); // reuse error: insufficient staked
        }
        staked[token] -= amount;
        IERC20(token).safeTransfer(msg.sender, amount);
        emit Withdrawn(token, amount);
        return amount;
    }

    function balanceOfStaked(address token) external view returns (uint256) {
        return staked[token];
    }

    /**
     * @notice Owner-only "yield" top-up used to prove the shares→assets
     *         exchange rate moves on-chain. Tokens must be transferred to this
     *         contract beforehand (e.g. safeTransferFrom by the donor).
     */
    function donateYield(address token, uint256 amount) external onlyOwner {
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        staked[token] += amount;
        emit YieldDonated(token, amount);
    }

    function isGuardianStrategy() external pure returns (bool) {
        return true;
    }
}