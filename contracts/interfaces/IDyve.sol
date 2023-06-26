// SPDX-License-Identifier: MIT
pragma solidity ^0.8.16;

import {OrderTypes, OrderType} from "../libraries/OrderTypes.sol";
import {IReservoirOracle} from "./IReservoirOracle.sol";

interface IDyve {
    // The NFT's listing status
    enum OrderStatus {
        EMPTY,
        BORROWED,
        EXPIRED,
        CLOSED
    }

    error InvalidAddress();
    error InvalidMinNonce();
    error EmptyNonceArray();
    error InvalidNonce(uint256 nonce);
    error InvalidMsgValue();
    error InvalidSigner();
    error ExpiredListing();
    error ExpiredNonce();
    error InvalidFee();
    error InvalidCollateral();
    error InvalidDuration();
    error InvalidAmount();
    error InvalidCurrency();
    error InvalidSignature();
    error TokenFlagged();
    error InvalidSender(address sender);
    error InvalidOrderExpiration();
    error InvalidOrderStatus();
    error NotTokenOwner(address collection, uint256 tokenId);
    error InvalidMessage();

    event CancelAllOrders(address indexed user, uint256 newMinNonce);
    event CancelMultipleOrders(address indexed user, uint256[] orderNonces);
    event ProtocolFeeManagerUpdated(address indexed protocolFeeManagerAddress);
    event WhitelistedCurrenciesUpdated(address indexed whitelistedCurrenciesAddress);
    event ReservoirOracleUpdated(address indexed reservoirOracle);
    event ProtocolFeeRecipientUpdated(address indexed _protocolFeeRecipient);
    event ReserovirOracleAddressUpadted(address indexed _reservoirOracleAddress);

    event OrderCreated( // ask hash of the maker order
        bytes32 indexed orderHash,
        address indexed lender,
        address indexed borrower,
        OrderType orderType,
        address collection,
        uint256 tokenId,
        uint256 amount,
        uint256 collateral,
        uint256 fee,
        address currency,
        uint256 expiryDateTime
    );
    event Close(bytes32 indexed orderHash, uint256 returnTokenId);
    event Claim(bytes32 indexed orderHash);

    function cancelAllOrdersForSender(uint256 minNonce) external;
    function cancelMultipleMakerOrders(uint256[] calldata orderNonces) external;
    function fulfillOrder(
        OrderTypes.MakerOrder calldata makerOrder,
        IReservoirOracle.Message calldata message,
        bytes calldata additionalParameters
    ) external payable;
    function closePosition(
        OrderTypes.Order calldata order,
        uint256 returnTokenId,
        IReservoirOracle.Message calldata message
    ) external;
    function claimCollateral(OrderTypes.Order calldata order) external;
    function updateProtocolFeeManager(address _protocolFeeManager) external;
    function updateWhitelistedCurrencies(address _whitelistedCurrencies) external;
    function updateReservoirOracle(address _reservoirOracle) external;
    function updateProtocolFeeRecipient(address _protocolFeeRecipient) external;

    /**
     * INTERNAL FUNCTIONALITY
     *
     * function _createOrder(OrderTypes.Order calldata order, bytes32 orderHash, address lender, address borrower)
     *     internal;
     * function _transferERC20(
     *     address from,
     *     address to,
     *     uint256 fee,
     *     uint256 collateral,
     *     address currency,
     *     address premiumCollection,
     *     uint256 premiumTokenId
     * ) internal;
     * function _validateTokenFlaggingMessage(
     *     IReservoirOracle.Message calldata message,
     *     address collection,
     *     uint256 tokenId
     * ) internal view;
     * function _validateOrder(OrderTypes.Order calldata order, bytes32 orderHash)
     *     internal
     *      view;
     */
}
