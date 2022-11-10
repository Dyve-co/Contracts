// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface INonceManager {
  function cancelAllOrdersForSender(uint256 minNonce) external;
  function cancelMultipleMakerOrders(uint256[] calldata orderNonces) external;
  function getUserMinOrderNonce() external view returns (uint256);
  function setExecutedUserOrderNonce(uint256 nonce) external;
  function isUserOrderNonceExecutedOrCancelled(uint256 nonce) external view returns (bool);
}