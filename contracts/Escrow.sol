// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

// OZ libraries
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract Escrow is Ownable {
  address public exchangeContractAddress;

  constructor() {}

  receive() external payable {}
  fallback() external payable {}

  function releaseCollateral(address recipient, uint256 amount) external returns (bool) {
    require(msg.sender == exchangeContractAddress, "Escrow: Only the exchange contract can release collateral.");
    (bool ok,) = payable(recipient).call{value: amount}("");

    return ok;
  }

  function setExchangeContractAddress(address _exchangeContractAddress) external onlyOwner {
    exchangeContractAddress = _exchangeContractAddress;
  }
}
