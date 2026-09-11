// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title ReentrantToken
 * @notice Test-only ERC-20 with an evil `transferFrom` hook that attempts to
 *         reenter the vault during the deposit transfer. Proves the vault's
 *         ReentrancyGuard + ERC-4626 ordering leaves no attack window.
 */
contract ReentrantToken is ERC20 {
    address public target;
    bool public armed;

    constructor(address target_, bool armed_) ERC20("Reentrant Token", "RE") {
        target = target_;
        armed = armed_;
    }

    function setArmed(bool armed_) external {
        armed = armed_;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    // The vault hooks this during `safeTransferFrom` (assets arrive here
    // first). We fire the reentrancy BEFORE the vault mints shares.
    function transferFrom(address from, address to, uint256 amount)
        public
        override
        returns (bool)
    {
        // first update balances so a future transfer inspect that we are in a
        // "clean-ish" state; then attempt the reentrant call
        _transfer(from, to, amount);
        if (armed) {
            (bool ok, ) = target.call(abi.encodeWithSignature("deposit(uint256,address)", amount, from));
            require(ok, "reentrancy blocked");
        }
        return true;
    }
}