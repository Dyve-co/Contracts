// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

contract CoolCats is ERC721, Ownable {
    using Strings for uint256;

    uint256 public counter = 0;
    string public baseExtension = ".json";

    constructor() ERC721("CoolCats", "CCAT") {}

    function mint() external {
        _safeMint(msg.sender, counter);
        counter += 1;
    }

    function _baseURI() internal pure override returns (string memory) {
        return "ipfs://QmR39V7cAdb3WJHYRaNTuhbc8CQymXRVKDXJBKGkTUtEfW/";
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireMinted(tokenId);

        string memory baseURI = _baseURI();
        return bytes(baseURI).length > 0 ? string(abi.encodePacked(baseURI, tokenId.toString(), baseExtension)) : "";
    }
}