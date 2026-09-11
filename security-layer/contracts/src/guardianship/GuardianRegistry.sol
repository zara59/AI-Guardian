// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IGuardianRegistry} from "../../interfaces/IGuardianRegistry.sol";

/// @title GuardianRegistry
/// @notice Public, permissionless self-registration index consumed by
///         Guardian's on-chain opportunity discovery pipeline.
///
///         IMPORTANT — this contract asserts NOTHING about the quality of an
///         entry. Registration is a claim, not a guarantee. The discovery
///         service independently verifies each entry against the live chain
///         (strategy implements the GuardianStrategy interface, the vault is
///         an ERC-4626 whose `asset()` is the registered token, the vault's
///         current `strategy()` is the registered strategy, the vault is not
///         paused). Only entries that pass that on-chain validation become
///         rankable opportunities.
contract GuardianRegistry is IGuardianRegistry {
    Registration[] private _all;
    mapping(address strategy => Registration) private _byStrategy;

    /// @inheritdoc IGuardianRegistry
    function registerStrategy(
        address strategy,
        address vault,
        address token,
        string calldata name,
        string calldata description,
        string calldata metadataUri
    ) external override returns (uint256 index) {
        if (strategy == address(0) || vault == address(0) || token == address(0)) {
            revert ZeroAddress();
        }
        if (bytes(name).length == 0) revert NameRequired();
        if (_byStrategy[strategy].strategy != address(0)) revert AlreadyRegistered(strategy);

        Registration memory reg = Registration({
            strategy: strategy,
            vault: vault,
            token: token,
            name: name,
            description: description,
            metadataUri: metadataUri,
            registeredAt: block.timestamp
        });

        _all.push(reg);
        _byStrategy[strategy] = reg;

        emit StrategyRegistered(
            strategy,
            vault,
            token,
            name,
            description,
            metadataUri,
            block.timestamp
        );
        return _all.length - 1;
    }

    /// @inheritdoc IGuardianRegistry
    function registrationsCount() external view override returns (uint256) {
        return _all.length;
    }

    /// @inheritdoc IGuardianRegistry
    function registrations(uint256 index)
        external
        view
        override
        returns (Registration memory)
    {
        return _all[index];
    }

    /// @inheritdoc IGuardianRegistry
    function byStrategy(address strategy)
        external
        view
        override
        returns (Registration memory)
    {
        return _byStrategy[strategy];
    }

    error ZeroAddress();
    error NameRequired();
    error AlreadyRegistered(address strategy);
}