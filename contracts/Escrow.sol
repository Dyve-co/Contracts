// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

contract Escrow {
  constructor() {}

  receive() external payable {}
  fallback() external payable {}

  function releaseCollateral(address recipient, uint256 amount) external returns (bool) {
    (bool ok,) = payable(recipient).call{value: amount}("");

    return ok;
  }
}
