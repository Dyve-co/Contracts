// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract BorrowerNft is ERC721 {
    event MintEvent(address indexed minter, uint256 tokenId);
    uint256 public counter = 0;

    constructor() ERC721("Borrower", "BOR") {}

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

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireMinted(tokenId);

        return "ipfs://QmNzomAvNw5FwYp4gv5tvjcEwB2pBzth8WdWU7ds4X5YEw";
    }
}
