// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

// Dyve Interfaces
import {INonceManager} from "./interfaces/INonceManager.sol";

/**
 * @notice The Dyve Contract to handle manging user nonces
 */
contract NonceManager is INonceManager {
  mapping(address => uint256) public userMinOrderNonce;
  mapping(address => mapping(uint256 => bool)) private _isUserOrderNonceExecutedOrCancelled;

  event CancelAllOrders(address indexed user, uint256 newMinNonce);
  event CancelMultipleOrders(address indexed user, uint256[] orderNonces);
  event SetExecutedOrderNonce(address indexed user, uint256 nonce);

  /**
  * @notice Cancel all pending orders for a sender
  * @param minNonce minimum user nonce
  */
  function cancelAllOrdersForSender(uint256 minNonce) external {
      require(minNonce > userMinOrderNonce[msg.sender], "Cancel: Order nonce lower than current");
      require(minNonce < userMinOrderNonce[msg.sender] + 500000, "Cancel: Cannot cancel more orders");
      userMinOrderNonce[msg.sender] = minNonce;

      emit CancelAllOrders(msg.sender, minNonce);
  }

  /**
  * @notice Cancel maker orders
  * @param orderNonces array of order nonces
  */
  function cancelMultipleMakerOrders(uint256[] calldata orderNonces) external {
    require(orderNonces.length > 0, "Cancel: Cannot be empty");

    for (uint256 i = 0; i < orderNonces.length; i++) {
      require(orderNonces[i] >= userMinOrderNonce[msg.sender], "Cancel: Order nonce lower than current");
      _isUserOrderNonceExecutedOrCancelled[msg.sender][orderNonces[i]] = true;
    }

    emit CancelMultipleOrders(msg.sender, orderNonces);
  }

  /**
  * @notice Updates the order nonce that is being executed or cancelled
  */
  function setExecutedUserOrderNonce(uint256 nonce) external {
    _isUserOrderNonceExecutedOrCancelled[msg.sender][nonce] = true;

    emit SetExecutedOrderNonce(msg.sender, nonce);
  }

  /**
  * @notice Check the users minimum order nonce
  */
  function getUserMinOrderNonce() external view returns (uint256) {
    return userMinOrderNonce[msg.sender];
  }

  /**
  * @notice Check if order nonce is executed or cancelled
  */
  function isUserOrderNonceExecutedOrCancelled(uint256 nonce) external view returns (bool) {
    return _isUserOrderNonceExecutedOrCancelled[msg.sender][nonce];
  }
}