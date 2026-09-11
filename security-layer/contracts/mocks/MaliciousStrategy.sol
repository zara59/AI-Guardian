// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IYieldStrategy} from "../interfaces/IYieldStrategy.sol";

/**
 * @title MaliciousStrategy
 * @notice Test-only strategy that LOOKS Guardian-compatible
 *         (`isGuardianStrategy() == true`) but reverts on every interaction.
 *         Used to prove that a misbehaving strategy call cannot steal or lose
 *         funds: the vault's deposit/withdraw revert in full (all-or-nothing)
 *         and the vault never holds residual balances or allowances.
 */
contract MaliciousStrategy is IYieldStrategy {
    function deposit(address, uint256) external pure returns (uint256) {
        revert("MaliciousStrategy: deposit reverted");
    }

    function withdraw(address, uint256) external pure returns (uint256) {
        revert("MaliciousStrategy: withdraw reverted");
    }

    function balanceOfStaked(address) external pure returns (uint256) {
        return 0;
    }

    function isGuardianStrategy() external pure returns (bool) {
        return true;
    }
}

/**
 * @title NotAStrategy
 * @notice Test-only arbitrary contract with no Guardian marker. The vault must
 *         refuse to allowlist it as a strategy.
 */
contract NotAStrategy {
    // no isGuardianStrategy() at all
}

/**
 * @title FalseStrategy
 * @notice Test-only contract that explicitly answers "not a Guardian strategy".
 *         Allowlisting it must revert with InvalidStrategy.
 */
contract FalseStrategy {
    function isGuardianStrategy() external pure returns (bool) {
        return false;
    }
}

contract ArbitraryErc20 is ERC20 {
    constructor() ERC20("Arbitrary", "ARB") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function isGuardianStrategy() external pure returns (bool) {
        return true; // marker can be spoofed by ANY contract; vault trusts only admin
    }
}