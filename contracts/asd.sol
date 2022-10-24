// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

// Dyve Interfaces
import {ReservoirOracle} from "./ReservoirOracle.sol";

contract Test is ReservoirOracle {
  // event Oracle(uint256 price);

  constructor() ReservoirOracle(0x32dA57E736E05f75aa4FaE2E9Be60FD904492726) {}

  function oracle(Message calldata message) external {
    uint256 maxMessageAge = 5 minutes;
    if (!_verifyMessage(message.id, maxMessageAge, message)) {
        revert InvalidMessage();
    }

    // emit Oracle(5);

    // (
    //   address messageCurrency, 
    //   uint256 messagePrice
    // ) = abi.decode(message.payload, (address, uint256));

    // return messagePrice;
  } 
}
