// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title RevertingToken
 * @notice Test-only ERC-20 that reverts on every transfer/transferFrom. Used
 *         to prove SafeERC20-style handling surfaces a clean revert and the
 *         vault never ends in a partial state.
 */
contract RevertingToken is ERC20 {
    constructor() ERC20("Reverting Token", "REV") {}

    function transfer(address, uint256) public pure override returns (bool) {
        revert("RevertingToken: transfer blocked");
    }

    function transferFrom(address, address, uint256)
        public
        pure
        override
        returns (bool)
    {
        revert("RevertingToken: transferFrom blocked");
    }

    function approve(address, uint256) public pure override returns (bool) {
        revert("RevertingToken: approve blocked");
    }

    function mint(address, uint256) external {
        revert("RevertingToken: cannot mint");
    }

    // silence unused-warning for the override signatures above
    function balanceOf(address) public view override returns (uint256) {
        return 0;
    }
}