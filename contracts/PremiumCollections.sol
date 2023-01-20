
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.16;

// OZ libraries
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract PremiumCollections is Ownable {
  mapping(address => uint256) public premiumCollections;

  event UpdatedPremiumCollection(address indexed collection, uint256 reducedFeeRate);

  /**
  * @notice updates the fee rate for the specified collection
  * @param collection the address of the collection to be added
  * @param feeRate the reduced fee rate to be applied for lenders who hold an NFT from this collection
  * @dev setting the fee rate to zero will remove the collection from the list of premium collections
  */
  function updatePremiumCollection(address collection, uint256 feeRate) external onlyOwner {
    premiumCollections[collection] = feeRate;
    
    emit UpdatedPremiumCollection(collection, feeRate);
  }

  /**
  * @notice returns the reduced fee rate for the specified collection
  * @param collection the address of the collection to be checked
  */
  function getPremiumCollectionRate(address collection) external view returns (uint256) {
    return premiumCollections[collection];
  }
}