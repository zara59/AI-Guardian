// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title GuardianTestToken
 * @notice Mintable test ERC-20 used to validate the Phase 4 bridge on a
 *         testnet. Deliberately uses 6 decimals (USDC-style) so the pipeline
 *         cannot assume 18 decimals. The owner mints and funds test wallets;
 *         it is clearly NOT a production asset.
 */
contract GuardianTestToken is ERC20, Ownable {
    uint8 private immutable _decimals;

    constructor(uint8 decimals_, uint256 initialSupply)
        ERC20("Guardian Test Token", "gTEST")
        Ownable(msg.sender)
    {
        _decimals = decimals_;
        _mint(msg.sender, initialSupply);
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external onlyOwner {
        _burn(from, amount);
    }
}