// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract LenderNft is ERC721, Ownable {
    event MintEvent(address indexed minter, uint256 tokenId);
    uint256 public counter = 0;

    constructor() ERC721("Lender", "LEN") {}

    function mint() public {
        counter += 1;
        _safeMint(msg.sender, counter);

        emit MintEvent(msg.sender, counter);
    }

    function batchMint(uint256 amount) external onlyOwner {
        for (uint256 i = 0; i < amount; i++) {
            mint();
        }
    }

    function totalSupply() external view returns (uint256) {
        return counter;
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireMinted(tokenId);

        return "ipfs://Qmexe3r8agaNCZAMDx8TNvveeJarJQGiMZ87Z6kKyaNJbL";
    }
}
