// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {GuardianRegistry} from "../src/guardianship/GuardianRegistry.sol";
import {IGuardianRegistry} from "../interfaces/IGuardianRegistry.sol";

contract GuardianRegistryTest is Test {
    GuardianRegistry internal registry;

    address internal strategy1 = makeAddr("strategy-1");
    address internal vault1 = makeAddr("vault-1");
    address internal tokenA = makeAddr("token-A");
    address internal strategy2 = makeAddr("strategy-2");
    address internal vault2 = makeAddr("vault-2");
    address internal tokenB = makeAddr("token-B");
    address internal stranger = makeAddr("stranger");

    function setUp() public {
        registry = new GuardianRegistry();
    }

    function testRegisterEmitsEventAndIndexes() public {
        vm.expectEmit(true, true, true, true, address(registry));
        emit IGuardianRegistry.StrategyRegistered(
            strategy1, vault1, tokenA, "Project One", "Does yield", "https://example.com", block.timestamp
        );
        uint256 index = registry.registerStrategy(
            strategy1, vault1, tokenA, "Project One", "Does yield", "https://example.com"
        );

        assertEq(index, 0, "first registration is index 0");
        assertEq(registry.registrationsCount(), 1, "one entry");

        IGuardianRegistry.Registration memory r = registry.registrations(0);
        assertEq(r.strategy, strategy1);
        assertEq(r.vault, vault1);
        assertEq(r.token, tokenA);
        assertEq(r.name, "Project One");
        assertEq(r.description, "Does yield");
        assertEq(r.metadataUri, "https://example.com");
        assertEq(r.registeredAt, block.timestamp, "chain-native timestamp");

        IGuardianRegistry.Registration memory s = registry.byStrategy(strategy1);
        assertEq(s.vault, vault1, "byStrategy lookup");
    }

    function testRegisterMultipleAppendInOrder() public {
        registry.registerStrategy(strategy1, vault1, tokenA, "One", "a", "");
        registry.registerStrategy(strategy2, vault2, tokenB, "Two", "b", "");

        assertEq(registry.registrationsCount(), 2);
        assertEq(registry.registrations(0).name, "One");
        assertEq(registry.registrations(1).name, "Two");
        assertEq(registry.byStrategy(strategy2).vault, vault2);
    }

    function testDuplicateStrategyRejected() public {
        registry.registerStrategy(strategy1, vault1, tokenA, "One", "a", "");
        vm.expectRevert(
            abi.encodeWithSelector(GuardianRegistry.AlreadyRegistered.selector, strategy1)
        );
        registry.registerStrategy(strategy1, vault2, tokenB, "Other", "b", "");
    }

    function testZeroAddressesRejected() public {
        vm.expectRevert(GuardianRegistry.ZeroAddress.selector);
        registry.registerStrategy(address(0), vault1, tokenA, "X", "x", "");
        vm.expectRevert(GuardianRegistry.ZeroAddress.selector);
        registry.registerStrategy(strategy1, address(0), tokenA, "X", "x", "");
        vm.expectRevert(GuardianRegistry.ZeroAddress.selector);
        registry.registerStrategy(strategy1, vault1, address(0), "X", "x", "");
    }

    function testEmptyNameRejected() public {
        vm.expectRevert(GuardianRegistry.NameRequired.selector);
        registry.registerStrategy(strategy1, vault1, tokenA, "", "x", "");
    }

    function testAnyoneCanRegister() public {
        vm.prank(stranger);
        registry.registerStrategy(strategy1, vault1, tokenA, "Anyone", "y", "");
        assertEq(registry.registrationsCount(), 1, "permissionless self-serve");
    }

    function testRegistryHoldsNoAuthorityOrBalance() public {
        assertEq(address(registry).balance, 0, "registry never holds funds");
        // The registry only stores data; it cannot move any strategy's assets
        // because it has no roles and no token balances are routed to it.
    }
}