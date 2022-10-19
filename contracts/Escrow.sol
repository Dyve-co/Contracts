// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

// Dyve interfaces
import "./interfaces/IERC721.sol";

contract Escrow {
  constructor() {}

  receive() external payable {}
  fallback() external payable {}

  function releaseCollateral(address recipient, uint256 amount) external returns (bool) {
    (bool ok,) = payable(recipient).call{value: amount}("");

    return ok;
  }

}
