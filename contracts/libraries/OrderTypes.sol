// SPDX-License-Identifier: MIT
pragma solidity ^0.8.16;


enum OrderType {
    ETH_TO_ERC721,
    ETH_TO_ERC1155,

    ERC20_TO_ERC721,
    ERC20_TO_ERC1155,

    ERC721_TO_ERC20,
    ERC1155_TO_ERC20
}

/**
 * @title OrderTypes
 * @notice This library contains order types for Dyve
 */
library OrderTypes {
    // keccak256("Order(uint256 orderType,address signer,address collection,uint256 tokenId,uint256 duration,uint256 collateral,uint256 fee,address currency,uint256 nonce,uint256 startTime,uint256 endTime)")
    bytes32 internal constant ORDER_HASH = 0x4cd010be0f33bfd9fd3bf5d095bfb8e3de601db29d12cfbc8c018018cb1bf4fc;

    struct Order {
        OrderType orderType; // the type of order
        address signer; // signer of the maker order
        address collection; // collection address
        uint256 tokenId; // id of the token
        uint256 duration; // duration of the borrow
        uint256 collateral; // collateral amount
        // uint256 baseCollateral; // minimum amount of collateral (used as )
        // uint256 collateralMultiplier; // collateral as a multiple of collection floor price (used as)
        uint256 fee; // fee for the lender
        address currency; // currency (e.g., WETH)
        uint256 nonce; // order nonce (must be unique unless new maker order is meant to override existing one e.g., lower ask price)
        uint256 startTime; // startTime in timestamp
        uint256 endTime; // endTime in timestamp
        uint8 v; // v: parameter (27 or 28)
        bytes32 r; // r: parameter
        bytes32 s; // s: parameter
    }

    function hash(Order memory order) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    ORDER_HASH,
                    order.orderType,
                    order.signer,
                    order.collection,
                    order.tokenId,
                    order.duration,
                    order.collateral,
                    // order.baseCollateral,
                    // order.collateralMultiplier,
                    order.fee,
                    order.currency,
                    order.nonce,
                    order.startTime,
                    order.endTime
                )
            );
    }
}