// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

contract OrderV1 {
  // State
  mapping(uint256 => address) public orders;

  // Events
  event OrderCreated(uint256 orderNumber, address owner);

  // Functions
  function createOrder(uint256 orderNumber) external {
    orders[orderNumber] = msg.sender;

    emit OrderCreated(orderNumber, msg.sender);
  }

  function getOrder(uint256 orderNumber) external view returns (address) {
    return orders[orderNumber];
  }
}

contract OrderV2 {
  // State
  mapping(uint256 => address) orders;
  uint256 public orderLength;

  // Events
  event OrderCreated(uint256 orderNumber, address owner);
  event OrderUpdated(uint256 orderNumber, address newOwner);

  // Functions
  function createOrder(uint256 orderNumber) external {
    orders[orderNumber] = msg.sender;

    emit OrderCreated(orderNumber, msg.sender);
  }

  function updateOrder(uint256 orderNumber, address updatedAddress) external {
    orders[orderNumber] = updatedAddress;

    emit OrderUpdated(orderNumber, msg.sender);
  }

  function getOrder(uint256 orderNumber) external view returns (address) {
    return orders[orderNumber];
  }
}
