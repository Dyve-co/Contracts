// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// The interface to call NFT functionality from Dyve:
interface IERC721 {
    function safeTransferFrom(address from, address to, uint256 tokenId) external;
    function approve(address to, uint256 tokenId) external;
    function ownerOf(uint256 tokenID) external view returns (address);
    function name() external view returns (string memory);
    function symbol() external view returns (string memory);
}
