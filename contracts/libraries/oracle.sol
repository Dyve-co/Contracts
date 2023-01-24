// SPDX-License-Identifier: MIT
pragma solidity ^0.8.16;
import "hardhat/console.sol";

// Inspired by https://github.com/ZeframLou/trustus
contract Oracle {
    // --- Structs ---

    struct Message {
        bytes32 id;
        bytes payload;
        // The UNIX timestamp when the message was signed by the oracle
        uint256 timestamp;
        // ECDSA signature or EIP-2098 compact signature
        bytes signature;
    }

    // --- Errors ---

    error InvalidId();
    error InvalidTimestamp();
    error InvalidSignatureLength();
    error InvalidMessage();

    // --- Fields ---

    // address private constant RESERVOIR_ORACLE_ADDRESS = 0x32dA57E736E05f75aa4FaE2E9Be60FD904492726;
    address private immutable RESERVOIR_ORACLE_ADDRESS;

    constructor(address _address) {
        RESERVOIR_ORACLE_ADDRESS = _address;
    }

    // --- Internal methods ---

    function hashStruct(address collection, uint256 tokenId) external pure returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256("Token(address contract,uint256 tokenId)"),
                collection,
                tokenId
            )
        );
    }

    function verifyMessage(
        // uint256 validFor,
        Message memory message
    ) external pure returns (address) {
        // Ensure the message timestamp is valid
        // if (
        //     message.timestamp > block.timestamp ||
        //     message.timestamp + validFor < block.timestamp
        // ) {
        //     revert InvalidTimestamp();
        // }

        bytes32 r;
        bytes32 s;
        uint8 v;

        // Extract the individual signature fields from the signature
        bytes memory signature = message.signature;
        if (signature.length == 64) {
            // EIP-2098 compact signature
            bytes32 vs;
            assembly {
                r := mload(add(signature, 0x20))
                vs := mload(add(signature, 0x40))
                s := and(
                    vs,
                    0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff
                )
                v := add(shr(255, vs), 27)
            }
        } else if (signature.length == 65) {
            // ECDSA signature
            assembly {
                r := mload(add(signature, 0x20))
                s := mload(add(signature, 0x40))
                v := byte(0, mload(add(signature, 0x60)))
            }
        } else {
            revert InvalidSignatureLength();
        }

        address signerAddress = ecrecover(
            keccak256(
                abi.encodePacked(
                    "\x19Ethereum Signed Message:\n32",
                    // EIP-712 structured-data hash
                    keccak256(
                        abi.encode(
                            keccak256(
                                "Message(bytes32 id,bytes payload,uint256 timestamp)"
                            ),
                            message.id,
                            keccak256(message.payload),
                            message.timestamp
                        )
                    )
                )
            ),
            v,
            r,
            s
        );

        // Ensure the signer matches the designated oracle address
        return signerAddress;
    }
}