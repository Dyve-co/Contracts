// SPDX-License-Identifier: MIT
pragma solidity ^0.8.16;

interface IPremiumCollections {
  function getFeeRate(address collection) external view returns (uint256);  
}
