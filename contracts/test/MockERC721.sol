// SPDX-License-Identifier: MIT
pragma solidity ^0.8.16;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

contract MockERC721 is ERC721 {
    using Strings for uint256;

    uint256 public maxSupply = 10000;

    event MintEvent(address indexed minter, uint256 tokenId);

    uint256 public counter = 0;
    string public baseURI;

    constructor(string memory _name, string memory _token, string memory _baseURI) ERC721(_name, _token) {
        baseURI = _baseURI;
    }

    function mint() public {
        require(counter < maxSupply, "max supply reached");
        _safeMint(msg.sender, counter);
        counter++;

        emit MintEvent(msg.sender, counter);
    }

    function batchMint(uint256 amount) external {
        require(amount < 50, "too many");
        for (uint256 i = 0; i < amount; i++) {
            mint();
        }
    }

    function totalSupply() external view returns (uint256) {
        return counter;
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireMinted(tokenId);
        return string(abi.encodePacked(baseURI, tokenId.toString()));
    }
}
