
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.16;

// OZ libraries
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract PremiumCollections is Ownable {
  mapping(address => uint256) public premiumCollections;

  event AddPremiumCollection(address indexed collection, uint256 reducedFeeRate);
  event RemovePremiumCollection(address indexed collection);

  /**
  * @notice adds the specified currency to the list of supported currencies
  * @param collection the address of the collection to be added
  * @param reducedFeeRate the reduced fee rate to be applied for lenders who hold an NFT from this collection
  */
  function addPremiumCollection(address collection, uint256 reducedFeeRate) external onlyOwner {
    premiumCollections[collection] = reducedFeeRate;
    
    emit AddPremiumCollection(collection, reducedFeeRate);
  }

  /**
  * @notice removes the specified currency from the list of supported currencies
  * @param collection the address of the collection to be removed
  */
  function removePremiumCollection(address collection) external onlyOwner {
    premiumCollections[collection] = 0;
    
    emit RemovePremiumCollection(collection);
  }
}