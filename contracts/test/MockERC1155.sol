// SPDX-License-Identifier: MIT
pragma solidity ^0.8.16;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";

contract MockERC1155 is ERC1155 {
    event MintEvent(address indexed minter, uint256 tokenId, uint256 amount);
    uint256 public counter = 0;

    constructor() ERC1155("MockERC1155Uri") {}

    function mint(uint256 id, uint256 amount) public {
        _mint(msg.sender, id, amount, "");

        emit MintEvent(msg.sender, id, amount);
    }
}
