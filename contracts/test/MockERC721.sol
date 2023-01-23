// SPDX-License-Identifier: MIT
pragma solidity ^0.8.16;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract MockERC721 is ERC721 {
    event MintEvent(address indexed minter, uint256 tokenId);
    uint256 public counter = 0;

    constructor(string memory _name, string memory _token) ERC721(_name, _token) {}

    function mint() public {
        counter += 1;
        _safeMint(msg.sender, counter);

        emit MintEvent(msg.sender, counter);
    }

    function batchMint(uint256 amount) external {
        for (uint256 i = 0; i < amount; i++) {
            mint();
        }
    }

    function totalSupply() external view returns (uint256) {
        return counter;
    }
}
