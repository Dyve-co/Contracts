// SPDX-License-Identifier: MIT
pragma solidity ^0.8.16;

import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {ERC1155Receiver} from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Receiver.sol";

interface IMockErc721 {
    function mint(uint256 _mintAmount) external payable;
    function ownerOf(uint256 tokenId) external view returns (address);
    function safeTransferFrom(address from, address to, uint256 tokenId) external;
}
interface IMockErc1155 {
    function mint() external payable;
    function safeTransferFrom(address from, address to, uint256 tokenId, uint256 amount, bytes calldata data) external;
}

contract MockCollectionsMint is IERC721Receiver, ERC1155Receiver {
    IMockErc721 public azuki;
    IMockErc1155 public nyanCat;

    constructor(address _azukiAddress, address _nyanCat) {
        azuki = IMockErc721(_azukiAddress);
        nyanCat = IMockErc1155(_nyanCat);  
    }

    function batchMint() external payable {
        require(msg.value == 0.04 ether, "Insufficient funds");
        azuki.mint{value: 0.02 ether}(2);
        nyanCat.mint{value: 0.01 ether}();
        nyanCat.mint{value: 0.01 ether}();
    }

    function onERC721Received(address operator, address from, uint256 tokenId, bytes calldata) external pure returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }

    function onERC1155Received(address operator, address from, uint256 tokenId, uint256, bytes calldata) external pure override returns (bytes4) {
        return this.onERC1155BatchReceived.selector;
    }

    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata) external pure override returns (bytes4) {
        return this.onERC1155BatchReceived.selector;
    }
}
