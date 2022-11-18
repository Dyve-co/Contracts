// SPDX-License-Identifier: MIT
pragma solidity ^0.8.16;

/**
 * @title OrderTypes
 * @notice This library contains order types for Dyve
 */
library OrderTypes {
    // keccak256("MakerOrder(bool isOrderAsk,address signer,address collection,uint256 tokenId,uint256 duration,uint256 collateral,uint256 fee,uint256 nonce,uint256 startTime,uint256 endTime)")
    bytes32 internal constant MAKER_ORDER_HASH = 0xdc2ec73446e2f2be13384f113009c234f3c341a7706ebec11889644c41ad74d3;

    struct MakerOrder {
        bool isOrderAsk; // true --> ask / false --> bid
        address signer; // signer of the maker order
        address collection; // collection address
        uint256 tokenId; // id of the token
        uint256 duration; // duration of the borrow
        uint256 collateral; // collateral amount
        // uint256 baseCollateral; // minimum amount of collateral (used as )
        // uint256 collateralMultiplier; // collateral as a multiple of collection floor price (used as)
        uint256 fee; // fee for the lender
        // address currency; // currency (e.g., WETH)
        uint256 nonce; // order nonce (must be unique unless new maker order is meant to override existing one e.g., lower ask price)
        uint256 startTime; // startTime in timestamp
        uint256 endTime; // endTime in timestamp
        uint8 v; // v: parameter (27 or 28)
        bytes32 r; // r: parameter
        bytes32 s; // s: parameter
    }

    struct TakerOrder {
        bool isOrderAsk; // true --> ask / false --> bid
        address taker; // msg.sender
        uint256 collateral; // final price for the purchase
        uint256 fee;
        uint256 tokenId;
    }

    function hash(MakerOrder memory makerOrder) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    MAKER_ORDER_HASH,
                    makerOrder.isOrderAsk,
                    makerOrder.signer,
                    makerOrder.collection,
                    makerOrder.tokenId,
                    makerOrder.duration,
                    makerOrder.collateral,
                    // makerOrder.baseCollateral,
                    // makerOrder.collateralMultiplier,
                    makerOrder.fee,
                    makerOrder.nonce,
                    makerOrder.startTime,
                    makerOrder.endTime
                )
            );
    }
}