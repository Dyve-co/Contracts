// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract CoolCats is ERC721, Ownable{

    mapping(uint256 => string) tokenIDtoURI;
    constructor() ERC721("CoolCats", "CCAT") {
        // Mint to deployer all the coolcats
        for (uint i; i < 11; i++)
            _safeMint(owner(), i);
    }

    function _baseURI() internal pure override returns (string memory) {
        return "https://ipfs.io/ipfs/";
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireMinted(tokenId);

        string memory _tokenURI = tokenIDtoURI[tokenId];

        string memory baseURI = _baseURI();
        return bytes(baseURI).length > 0 ? string(abi.encodePacked(baseURI, _tokenURI)) : "";
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId
    ) internal override {
        super._beforeTokenTransfer(from, to, tokenId);
        
        if (tokenId == 0) {
            tokenIDtoURI[tokenId] = "QmXT9Gaiu6Znoz8hwf4788vTy2MnhpWCLBET1gS5XNvf4r";
        } else if (tokenId == 1) {
            tokenIDtoURI[tokenId] = "QmYrxAviWHGugdikgU1Awc8MRtfqxMYYRmBuCTMEc5mCAx";
        } else if (tokenId == 2) {
            tokenIDtoURI[tokenId] = "QmY3aNgaE3NNHc3sZTBENFgRosny1EGCWjUZV5aTXvTB5S";
        } else if (tokenId == 3) {
            tokenIDtoURI[tokenId] = "QmQsSnk1o8eCzJzXeLLvNAZaUBMVpQsMospuLaQJSgo3n3";
        } else if (tokenId == 4) {
            tokenIDtoURI[tokenId] = "QmfUHMxfitvj6MyhLCXH43M7abUCoqGUeJx5FMTQqofHsD";
        } else if (tokenId == 5) {
            tokenIDtoURI[tokenId] = "QmfUHMxfitvj6MyhLCXH43M7abUCoqGUeJx5FMTQqofHsD";
        } else if (tokenId == 6) {
            tokenIDtoURI[tokenId] = "QmeBeo9HD4pdJbBxxokZX8xNWUYhtLCxo9pXM8iBdaEjCP";
        } else if (tokenId == 7) {
            tokenIDtoURI[tokenId] = "QmV8uo9NvGsmwUisMcWJJBVWDoHCcXTtiaZiwbvzxFD4fZ";
        } else if (tokenId == 8) {
            tokenIDtoURI[tokenId] = "QmX7n8w5LowjDHRFtaZVhg4tWRuohXmWuvcKgnFFHbM3rE";
        } else if (tokenId == 9) {
            tokenIDtoURI[tokenId] = "Qmat6a6xpBcUs68wrUFiqqivc61gQg9M1N6S63vZHQhKPb ";
        } else if (tokenId == 10) {
            tokenIDtoURI[tokenId] = "QmdwsEVLVGcJZYd8tWcHShXkGkVG9pRQ7dLMWLFk223rfS";
        } else {
            revert("Collection does not contain this ID!");
        }
    }
}