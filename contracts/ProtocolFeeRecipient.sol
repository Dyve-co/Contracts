// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

// OZ libraries
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * @notice Contract to hold all of the protocol fees.
 */
contract ProtocolFeeRecipient is Ownable, ReentrancyGuard {
  constructor() {}

  receive() external payable {}
  fallback() external payable {}

  function withdrawFunds() external onlyOwner nonReentrant {
    (bool success, ) = msg.sender.call{value: address(this).balance}("");
    require(success, "Transfer failed.");
  }
}
