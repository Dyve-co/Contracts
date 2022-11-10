// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface IOrderManager {
  function createOrder(
    bytes32 _orderHash,
    address payable _lender,
    address payable _borrower,
    address _collection,
    uint256 _tokenId,
    uint256 _expiryDateTime,
    uint256 _collateral
  ) external;
  function closePosition(bytes32 orderHash, uint256 returnTokenId) external;
  function claimPosition(bytes32 orderHash) external;
}