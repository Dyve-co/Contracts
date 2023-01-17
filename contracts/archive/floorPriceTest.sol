// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

import {ReservoirOracle} from "../libraries/ReservoirOracle.sol";
import "hardhat/console.sol";

contract Oracle {
    using ReservoirOracle for ReservoirOracle.Message;

    function checkMessage(ReservoirOracle.Message calldata message) external view { 
        // Validate the message
        uint256 maxMessageAge = 5 minutes;
        if (!ReservoirOracle._verifyMessage(message.id, maxMessageAge, message)) {
            revert ReservoirOracle.InvalidMessage();
        }

        // (address messageCurrency, uint256 messagePrice) = abi.decode(message.payload, (address, uint256)); 
    }
}