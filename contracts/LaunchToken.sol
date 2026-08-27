// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract LaunchToken is ERC20 {
    uint256 public constant INITIAL_SUPPLY = 1_000_000_000 * 10 ** 18;

    address public immutable launchpad;
    address public immutable creator;

    constructor(
        string memory name_,
        string memory symbol_,
        address creator_,
        address launchpad_
    ) ERC20(name_, symbol_) {
        require(creator_ != address(0), "Invalid creator");
        require(launchpad_ != address(0), "Invalid launchpad");

        creator = creator_;
        launchpad = launchpad_;

        _mint(launchpad_, INITIAL_SUPPLY);
    }
}
