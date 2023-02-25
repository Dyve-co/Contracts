// SPDX-License-Identifier: MIT
pragma solidity ^0.8.16;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "hardhat/console.sol";

contract MockERC1155 is ERC1155 {
    event MintEvent(address indexed minter, uint256 tokenId, uint256 amount);
    uint256 public constant maxSupply = 1250;
    string private name;
    string private symbol;
    uint256 public availableTokens = 25;

    constructor(string memory _name, string memory _symbol, string memory _uri) ERC1155(_uri) {
        name = _name;
        symbol = _symbol;
    }

    function mint(uint256 id, uint256 amount) public {
        require(id < maxSupply, "invalid id");
        _mint(msg.sender, id, amount, "");

        emit MintEvent(msg.sender, id, amount);
    }

    function batchMint(uint256 amount) external {
        require(amount <= 5, 'too many');
        for (uint256 i = 0; i < amount; i++) {
            mint(block.timestamp % (availableTokens + i), 10);
        }
    }
}
