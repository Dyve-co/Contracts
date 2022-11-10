// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface IEscrow {
  function releaseCollateral(address recipient, uint256 amount) external returns (bool);
}
