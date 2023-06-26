// SPDX-License-Identifier: MIT
pragma solidity ^0.8.16;

// OZ libraries
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IERC20, SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

// Dyve contacts/interfaces/libraries
import {IDyve} from "./interfaces/IDyve.sol";
import {IWhitelistedCurrencies} from "./interfaces/IWhitelistedCurrencies.sol";
import {IProtocolFeeManager} from "./interfaces/IProtocolFeeManager.sol";
import {IReservoirOracle} from "./interfaces/IReservoirOracle.sol";
import {OrderTypes, OrderType} from "./libraries/OrderTypes.sol";

/**
 * @notice The Dyve Contract to handle lending and borrowing of NFTs
 */
contract Dyve is IDyve, ReentrancyGuard, Ownable, EIP712("Dyve", "1") {
    using SafeERC20 for IERC20;

    IWhitelistedCurrencies public whitelistedCurrencies;
    IProtocolFeeManager public protocolFeeManager;
    IReservoirOracle public reservoirOracle;

    address public protocolFeeRecipient;
    bytes4 public constant INTERFACE_ID_ERC721 = type(IERC721).interfaceId;
    bytes4 public constant INTERFACE_ID_ERC1155 = type(IERC1155).interfaceId;
    uint256 public constant nonceLimit = 500000;
    uint256 public constant bps = 10000;

    mapping(address => uint256) public userMinOrderNonce;
    mapping(address => mapping(uint256 => bool)) private _isUserOrderNonceExecutedOrCancelled;
    mapping(bytes32 => OrderStatus) public orders;

    /**
     * @notice Constructor
     * @param whitelistedCurrenciesAddress address of the WhitelistedCurrencies contract
     * @param protocolFeeManagerAddress address of the ProtocolFeeManager contract
     * @param reservoirOracleAddress address of the Reservoir Oracle
     * @param _protocolFeeRecipient protocol fee recipient address
     */
    constructor(
        address whitelistedCurrenciesAddress,
        address protocolFeeManagerAddress,
        address reservoirOracleAddress,
        address _protocolFeeRecipient
    ) {
        if (
            whitelistedCurrenciesAddress == address(0) || protocolFeeManagerAddress == address(0)
                || reservoirOracleAddress == address(0) || _protocolFeeRecipient == address(0)
        ) revert InvalidAddress();

        whitelistedCurrencies = IWhitelistedCurrencies(whitelistedCurrenciesAddress);
        protocolFeeManager = IProtocolFeeManager(protocolFeeManagerAddress);
        reservoirOracle = IReservoirOracle(reservoirOracleAddress);
        protocolFeeRecipient = _protocolFeeRecipient;
    }

    /**
     * @notice Cancel all pending orders for a sender
     * @param minNonce minimum user nonce
     */
    function cancelAllOrdersForSender(uint256 minNonce) external {
        if (minNonce <= userMinOrderNonce[msg.sender]) revert InvalidMinNonce();
        if (minNonce >= userMinOrderNonce[msg.sender] + nonceLimit) revert InvalidMinNonce();
        userMinOrderNonce[msg.sender] = minNonce;

        emit CancelAllOrders(msg.sender, minNonce);
    }

    /**
     * @notice Cancel maker orders
     * @param orderNonces array of order nonces
     */
    function cancelMultipleMakerOrders(uint256[] calldata orderNonces) external {
        if (orderNonces.length == 0) revert EmptyNonceArray();
        for (uint256 i = 0; i < orderNonces.length; i++) {
            if (orderNonces[i] < userMinOrderNonce[msg.sender]) revert InvalidNonce(orderNonces[i]);
            _isUserOrderNonceExecutedOrCancelled[msg.sender][orderNonces[i]] = true;
        }

        emit CancelMultipleOrders(msg.sender, orderNonces);
    }

    /**
     * @notice Fulfills the order
     * @param order the order to be fulfilled
     * @param message the message from the oracle
     */
    function fulfillOrder(
        OrderTypes.MakerOrder calldata order,
        IReservoirOracle.Message calldata message,
        bytes calldata additionalParameters
    ) external payable nonReentrant {
        uint256 tokenId = _getTokenId(additionalParameters, order);

        // Check the maker ask order
        _validateOrder(order, OrderTypes.hashMakerOrder(order));
        _validateTokenFlaggingMessage(message, order.collection, tokenId);

        // Update maker ask order status to true (prevents replay)
        _isUserOrderNonceExecutedOrCancelled[order.signer][order.nonce] = true;

        address lender = uint256(order.orderType) < 4 ? order.signer : msg.sender;
        address borrower = uint256(order.orderType) >= 4 ? order.signer : msg.sender;

        _createOrder(order, lender, borrower, tokenId);
        // Goes through the follwing procedure:
        // 1. Creates an order
        // 2. transfers the NFT to the borrower
        // 3. transfers the funds from the borrower to the respecitve recipients
        if (order.orderType == OrderType.ETH_TO_ERC721) {
            IERC721(order.collection).safeTransferFrom(order.signer, msg.sender, tokenId);

            _transferETH(order.signer, order.fee, order.premiumCollection, order.premiumTokenId);
        } else if (order.orderType == OrderType.ETH_TO_ERC1155) {
            IERC1155(order.collection).safeTransferFrom(order.signer, msg.sender, tokenId, order.amount, "");

            _transferETH(order.signer, order.fee, order.premiumCollection, order.premiumTokenId);
        } else if (order.orderType == OrderType.ERC20_TO_ERC721) {
            IERC721(order.collection).safeTransferFrom(order.signer, msg.sender, tokenId);

            _transferERC20(
                msg.sender,
                order.signer,
                order.fee,
                order.collateral,
                order.currency,
                order.premiumCollection,
                order.premiumTokenId
            );
        } else if (order.orderType == OrderType.ERC20_TO_ERC1155) {
            IERC1155(order.collection).safeTransferFrom(order.signer, msg.sender, tokenId, order.amount, "");

            _transferERC20(
                msg.sender,
                order.signer,
                order.fee,
                order.collateral,
                order.currency,
                order.premiumCollection,
                order.premiumTokenId
            );
        } else if (order.orderType == OrderType.ERC721_TO_ERC20) {
            IERC721(order.collection).safeTransferFrom(msg.sender, order.signer, tokenId);

            _transferERC20(
                order.signer,
                msg.sender,
                order.fee,
                order.collateral,
                order.currency,
                order.premiumCollection,
                order.premiumTokenId
            );
        } else if (order.orderType == OrderType.ERC1155_TO_ERC20) {
            IERC1155(order.collection).safeTransferFrom(msg.sender, order.signer, tokenId, order.amount, "");

            _transferERC20(
                order.signer,
                msg.sender,
                order.fee,
                order.collateral,
                order.currency,
                order.premiumCollection,
                order.premiumTokenId
            );
        }
    }

    /**
     * @notice Return back an NFT to the lender and release collateral to the borrower
     * @dev we check that the borrower owns the incoming ID from the collection.
     * @param order the order data
     * @param returnTokenId the NFT to be returned
     * @param message the message from the oracle
     */
    function closePosition(
        OrderTypes.Order calldata order,
        uint256 returnTokenId,
        IReservoirOracle.Message calldata message
    ) external nonReentrant {
        bytes32 orderHash = OrderTypes.hashOrder(order);
        if (orders[orderHash] != OrderStatus.BORROWED) revert InvalidOrderStatus();
        if (order.borrower != msg.sender) revert InvalidSender(msg.sender);
        if (order.expiryDateTime <= block.timestamp) revert InvalidOrderExpiration();

        if (IERC165(order.collection).supportsInterface(INTERFACE_ID_ERC1155)) {
            if (IERC1155(order.collection).balanceOf(msg.sender, returnTokenId) < order.amount) {
                revert NotTokenOwner(order.collection, returnTokenId);
            }
        } else {
            if (IERC721(order.collection).ownerOf(returnTokenId) != msg.sender) {
                revert NotTokenOwner(order.collection, returnTokenId);
            }
        }

        _validateTokenFlaggingMessage(message, order.collection, returnTokenId);

        orders[orderHash] = OrderStatus.CLOSED;

        // 1. Transfer the NFT back to the lender
        if (IERC165(order.collection).supportsInterface(INTERFACE_ID_ERC1155)) {
            IERC1155(order.collection).safeTransferFrom(order.borrower, order.lender, returnTokenId, order.amount, "");
        } else {
            IERC721(order.collection).safeTransferFrom(order.borrower, order.lender, returnTokenId);
        }

        // 2. Transfer the collateral from dyve to the borrower
        if (order.orderType == OrderType.ETH_TO_ERC721 || order.orderType == OrderType.ETH_TO_ERC1155) {
            (bool success,) = order.borrower.call{value: order.collateral}("");
            require(success, "Collateral transfer to borrower failed");
        } else {
            IERC20(order.currency).safeTransfer(order.borrower, order.collateral);
        }

        emit Close(orderHash, returnTokenId);
    }

    /**
     * @notice Releases collateral to the lender for the expired borrow
     * @param order the order data
     */
    function claimCollateral(OrderTypes.Order calldata order) external nonReentrant {
        bytes32 orderHash = OrderTypes.hashOrder(order);
        if (orders[orderHash] != OrderStatus.BORROWED) revert InvalidOrderStatus();
        if (order.lender != msg.sender) revert InvalidSender(msg.sender);
        if (order.expiryDateTime > block.timestamp) revert InvalidOrderExpiration();

        orders[orderHash] = OrderStatus.EXPIRED;

        // Transfer the collateral from dyve to the borrower
        if (order.orderType == OrderType.ETH_TO_ERC721 || order.orderType == OrderType.ETH_TO_ERC1155) {
            (bool success,) = order.lender.call{value: order.collateral}("");
            require(success, "Collateral transfer to lender failed");
        } else {
            IERC20(order.currency).safeTransfer(order.lender, order.collateral);
        }

        emit Claim(orderHash);
    }

    /**
     * @notice retrieves the tokenId based on the orderType of the order
     * @param additionalParameters the bytes from the taker ask in the instance of it being a collection offer
     * @param order the associated order
     */
    function _getTokenId(bytes calldata additionalParameters, OrderTypes.MakerOrder calldata order)
        internal
        pure
        returns (uint256)
    {
        if (uint256(order.orderType) < 6) {
            return order.tokenId;
        } else {
            return abi.decode(additionalParameters, (uint256));
        }
    }

    /**
     * @notice Creates an Order
     * @dev only stores the hash of the order
     * @param order the order information
     * @param lender the lender of the order
     * @param borrower the borrower of the order
     */
    function _createOrder(OrderTypes.MakerOrder calldata order, address lender, address borrower, uint256 tokenId)
        internal
    {
        // reimplementation of hasOrder since hashOrder requires the parameter to be calldata
        bytes32 orderHash = keccak256(
            abi.encode(
                order.orderType,
                lender,
                borrower,
                order.collection,
                tokenId,
                block.timestamp + order.duration,
                order.amount,
                order.collateral,
                order.currency
            )
        );
        orders[orderHash] = OrderStatus.BORROWED;

        emit OrderCreated(
            orderHash,
            lender,
            borrower,
            order.orderType,
            // order.nonce,
            order.collection,
            tokenId,
            order.amount,
            order.collateral,
            order.fee,
            order.currency,
            block.timestamp + order.duration
        );
    }

    /**
     * @notice Transfer fees and protocol fee to the Lender and procotol fee recipient respectively in ETH
     * @param to Address of recipient to receive the fees (Lender)
     * @param fee Fee amount being transffered to Lender
     * @param premiumCollection Address of the premium collection (Zero address if it doesn't exist)
     * @param premiumTokenId TokenId from the premium collection
     */
    function _transferETH(address to, uint256 fee, address premiumCollection, uint256 premiumTokenId) internal {
        uint256 protocolFee =
            (fee * protocolFeeManager.determineProtocolFeeRate(premiumCollection, premiumTokenId, to)) / bps;
        bool success;
        // 1. Protocol fee transfer
        if (protocolFee != 0) {
            (success,) = payable(protocolFeeRecipient).call{value: protocolFee}("");
            require(success, "Protocol fee transfer failed");
        }

        // 2. Lender fee transfer
        (success,) = payable(to).call{value: fee - protocolFee}("");
        require(success, "Lender fee transfer failed");
    }

    /**
     * @notice Transfer fees, collateral and protocol fee to the Lender, Dyve and procotol fee recipient respectively in the given ERC20 currency
     * @param from Address of sender of the funds (Borrower)
     * @param to Address of recipient to receive the fees (Lender)
     * @param fee Fee amount being transffered to Lender
     * @param collateral Collateral amount being transffered to Dyve
     * @param currency Address of the ERC20 currency
     * @param premiumCollection Address of the premium collection (Zero address if it doesn't exist)
     * @param premiumTokenId TokenId from the premium collection
     */
    function _transferERC20(
        address from,
        address to,
        uint256 fee,
        uint256 collateral,
        address currency,
        address premiumCollection,
        uint256 premiumTokenId
    ) internal {
        uint256 protocolFee =
            (fee * protocolFeeManager.determineProtocolFeeRate(premiumCollection, premiumTokenId, to)) / bps;

        // 1. Protocol fee transfer
        if (protocolFee != 0) {
            IERC20(currency).safeTransferFrom(from, protocolFeeRecipient, protocolFee);
        }

        // 2. Lender fee transfer
        IERC20(currency).safeTransferFrom(from, to, fee - protocolFee);

        // 3. Collateral transfer
        IERC20(currency).safeTransferFrom(from, address(this), collateral);
    }

    /**
     * @notice updates the ProtocolFeeManager instance
     * @param _protocolFeeManager the address of the new ProtocolFeeManager
     */
    function updateProtocolFeeManager(address _protocolFeeManager) external onlyOwner {
        protocolFeeManager = IProtocolFeeManager(_protocolFeeManager);

        emit ProtocolFeeManagerUpdated(_protocolFeeManager);
    }

    /**
     * @notice updates the WhitelistedCurrencies instance
     * @param _whitelistedCurrencies the address of the new WhitelistedCurrencies
     */
    function updateWhitelistedCurrencies(address _whitelistedCurrencies) external onlyOwner {
        whitelistedCurrencies = IWhitelistedCurrencies(_whitelistedCurrencies);

        emit WhitelistedCurrenciesUpdated(_whitelistedCurrencies);
    }

    /**
     * @notice updates the address of the ReservoirOracle Signer
     * @param _reservoirOracle the address of the ReservoirOracle Signer
     */
    function updateReservoirOracle(address _reservoirOracle) external onlyOwner {
        reservoirOracle = IReservoirOracle(_reservoirOracle);

        emit ReservoirOracleUpdated(_reservoirOracle);
    }

    /**
     * @notice updates the ProtocolFeeRecipient instance
     * @param _protocolFeeRecipient the address of the new ProtocolFeeRecipient
     */
    function updateProtocolFeeRecipient(address _protocolFeeRecipient) external onlyOwner {
        protocolFeeRecipient = _protocolFeeRecipient;

        emit ProtocolFeeRecipientUpdated(_protocolFeeRecipient);
    }

    function _validateTokenFlaggingMessage(
        IReservoirOracle.Message calldata message,
        address collection,
        uint256 tokenId
    ) internal view {
        // Validate the message
        uint256 maxMessageAge = 5 minutes;
        bytes32 tokenStruct = keccak256("Token(address contract,uint256 tokenId)");
        bytes32 messageId = keccak256(abi.encode(tokenStruct, collection, tokenId));
        if (!reservoirOracle.verifyMessage(messageId, maxMessageAge, message)) revert InvalidMessage();

        (bool flaggedStatus, /* uint256 */ ) = abi.decode(message.payload, (bool, uint256));
        if (flaggedStatus) revert TokenFlagged();
    }

    /**
     * @notice Verify the validity of the maker order
     * @param order the order to be verified
     * @param orderHash computed hash for the order
     */
    function _validateOrder(OrderTypes.MakerOrder calldata order, bytes32 orderHash) internal view {
        // Verify msg value
        if (
            (order.orderType == OrderType.ETH_TO_ERC721 || order.orderType == OrderType.ETH_TO_ERC1155)
                && msg.value != (order.fee + order.collateral)
        ) {
            revert InvalidMsgValue();
        }
        if (
            (order.orderType != OrderType.ETH_TO_ERC721 && order.orderType != OrderType.ETH_TO_ERC1155)
                && msg.value != 0
        ) revert InvalidMsgValue();

        // Verify the signer is not address(0)
        if (order.signer == address(0)) revert InvalidSigner();

        // Verify the order listing is not expired
        if (order.endTime <= block.timestamp) revert ExpiredListing();

        // Verify whether the nonce has expired
        if (
            _isUserOrderNonceExecutedOrCancelled[order.signer][order.nonce]
                || order.nonce < userMinOrderNonce[order.signer]
        ) revert ExpiredNonce();

        // Verify the fee, collateral and duration are not 0
        if (order.fee == 0) revert InvalidFee();
        if (order.collateral == 0) revert InvalidCollateral();
        if (order.duration == 0) revert InvalidDuration();

        // Verify that the amount is not 0 for ERC1155 orders
        if (IERC165(order.collection).supportsInterface(INTERFACE_ID_ERC1155) && order.amount == 0) {
            revert InvalidAmount();
        }

        // Verify that the amount is equal to 1 for ERC721 orders
        if (IERC165(order.collection).supportsInterface(INTERFACE_ID_ERC721) && order.amount != 1) {
            revert InvalidAmount();
        }

        // Verify that the currency is whitelisted for ERC20 orders
        if (
            order.orderType != OrderType.ETH_TO_ERC721 && order.orderType != OrderType.ETH_TO_ERC1155
                && !(whitelistedCurrencies.isCurrencyWhitelisted(order.currency))
        ) {
            revert InvalidCurrency();
        }

        // Verify that the currency is zero address for ETH orders
        if (
            (order.orderType == OrderType.ETH_TO_ERC721 || order.orderType == OrderType.ETH_TO_ERC1155)
                && order.currency != address(0)
        ) revert InvalidCurrency();

        // Verify the validity of the signature
        if (!(SignatureChecker.isValidSignatureNow(order.signer, _hashTypedDataV4(orderHash), order.signature))) {
            revert InvalidSignature();
        }
    }
}
