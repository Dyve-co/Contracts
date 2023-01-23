// SPDX-License-Identifier: MIT
pragma solidity ^0.8.16;

/**
 * @title ErrorTypes
 * @notice This library contains error types for Dyve
 */
library ErrorTypes {
	error InvalidSigner();
	error ExpiredListing();
	error ExpiredOrderNonce();
	error InvalidFees();
	error InvalidCollateral();
	error InvalidCurrency();
	error InvalidSignature();
}