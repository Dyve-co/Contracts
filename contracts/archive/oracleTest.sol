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
        if (!ReservoirOracle._verifyMessage(maxMessageAge, message)) {
            revert ReservoirOracle.InvalidMessage();
        }

        (bool flaggedStatus, uint256 lastTransferTime) = abi.decode(message.payload, (bool, uint256)); 
        console.log("flagged status");
        console.logBool(flaggedStatus);
        console.log("last transfer time");
        console.logUint(lastTransferTime);
    }
}