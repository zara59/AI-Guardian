// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IYieldStrategy
 * @notice Interface for the ONLY protocol contract a GuardianVault is allowed
 *         to interact with. The vault makes exactly two fixed external calls —
 *         deposit(token, amount) and withdraw(token, amount) — and nothing else.
 *         There is no arbitrary calldata, no arbitrary target and no delegatecall.
 *
 *         Phase 4 ships one audited testnet implementation:
 *         `GuardianSimpleStakingStrategy`. A real production adapter (e.g. Aave,
 *         Lido) must implement this same interface and be allowlisted via the
 *         vault's `setStrategy`.
 */
interface IYieldStrategy {
    /**
     * @notice Pull `amount` of `token` from msg.sender (the vault) and put it
     *         to work. MUST revert (not silently no-op) if anything goes wrong.
     * @return sharesOrUnits opaque strategy accounting value (may be 0)
     */
    function deposit(address token, uint256 amount) external returns (uint256);

    /**
     * @notice Return `amount` of `token` to msg.sender (the vault).
     *         MUST revert if the strategy cannot honour the request.
     * @return sharesOrUnits opaque strategy accounting value (may be 0)
     */
    function withdraw(address token, uint256 amount) external returns (uint256);

    /**
     * @notice Total amount of `token` currently deployed in the strategy.
     *         This is the value the vault exposes as its `totalAssets`.
     */
    function balanceOfStaked(address token) external view returns (uint256);

    /**
     * @notice Marker proving this is a Guardian-compatible strategy contract.
     *         Prevents the vault from being pointed at an arbitrary contract.
     */
    function isGuardianStrategy() external pure returns (bool);
}
