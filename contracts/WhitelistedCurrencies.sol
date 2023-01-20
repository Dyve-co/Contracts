
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.16;

// OZ libraries
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract WhitelistedCurrencies is Ownable {
  mapping(address => bool) public isCurrencyWhitelisted;

  event AddCurrencyToWhitelist(address indexed currency);
  event RemoveCurrencyFromWhitelist(address indexed currency);

  /**
  * @notice adds the specified currency to the list of supported currencies
  * @param currency the address of the currency to be added
  */
  function addWhitelistedCurrency(address currency) external onlyOwner {
    isCurrencyWhitelisted[currency] = true;
 
    emit AddCurrencyToWhitelist(currency);
  }

  /**
  * @notice removes the specified currency from the list of supported currencies
  * @param currency the address of the currency to be removed
  */
  function removeWhitelistedCurrency(address currency) external onlyOwner {
    isCurrencyWhitelisted[currency] = false;
    
    emit RemoveCurrencyFromWhitelist(currency);
  }
}