// SPDX-License-Identifier: MIT
pragma solidity ^0.8.16;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract SaltyIdenticon is ERC721URIStorage, Ownable {
    uint256 private _currentTokenId = 0;
    string private _baseTokenURI;

    constructor(string memory baseTokenURI) ERC721("SaltyIdencticon", "SALT") {
        _baseTokenURI = baseTokenURI;
    }

    function batchMint(string[] calldata uriKeys) public {
        for (uint256 i = 0; i < uriKeys.length; i++) {
            _currentTokenId++;
            _mint(msg.sender, _currentTokenId);
            _setTokenURI(_currentTokenId, string.concat(_baseTokenURI, uriKeys[i]));
        }
    }

    function setBaseTokenURI(string memory baseTokenURI) public onlyOwner {
        _baseTokenURI = baseTokenURI;
    }
}
