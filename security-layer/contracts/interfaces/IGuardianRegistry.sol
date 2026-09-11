// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IGuardianRegistry
/// @notice The self-serve, on-chain index that Guardian's discovery pipeline
///         reads. A project that wants to be considered an opportunity calls
///         `registerStrategy` and supplies its yield strategy, vault, asset
///         and public project metadata.
///
///         Registration is permissionless and is NEVER treated as trust.
///         Guardian re-validates every claim by reading the chain itself
///         (GuardianStrategy interface, vault wiring, token shape) before the
///         opportunity can be ranked. This contract only indexes data; it
///         never holds funds and has no authority over any strategy.
interface IGuardianRegistry {
    /// One index entry. `registeredAt` is the block timestamp of
    /// registration (chain-native, no external clock).
    struct Registration {
        address strategy;
        address vault;
        address token;
        string name;
        string description;
        string metadataUri;
        uint256 registeredAt;
    }

    /// Emitted once per successful registration.
    /// `strategy`, `vault` and `token` are indexed so the discovery service
    /// can filter logs by any of them.
    event StrategyRegistered(
        address indexed strategy,
        address indexed vault,
        address indexed token,
        string name,
        string description,
        string metadataUri,
        uint256 registeredAt
    );

    /// Register a yield strategy with its vault and entry token.
    /// @param strategy address of the contract implementing
    ///                 Guardian's `isGuardianStrategy()`
    /// @param vault     the ERC-4626 vault users deposit into
    /// @param token     the ERC-20 entry asset (must equal vault.asset())
    /// @param name      short project/product name (non-empty)
    /// @param description what the project does (readable copy)
    /// @param metadataUri off-chain link (project site / docs), optional
    /// @return index    position in the registration list
    function registerStrategy(
        address strategy,
        address vault,
        address token,
        string calldata name,
        string calldata description,
        string calldata metadataUri
    ) external returns (uint256 index);

    /// Total number of registrations (for list reads / bootstrap).
    function registrationsCount() external view returns (uint256);

    /// Read one registration by index (0-based, append-order).
    function registrations(uint256 index) external view returns (Registration memory);

    /// Read a registration by strategy address (zero struct when absent).
    function byStrategy(address strategy) external view returns (Registration memory);
}