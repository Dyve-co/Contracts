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

// Dyve interfaces/libraries
import {IWhitelistedCurrencies} from "./interfaces/IWhitelistedCurrencies.sol";
import {IProtocolFeeManager} from "./interfaces/IProtocolFeeManager.sol";
import {OrderTypes, OrderType} from "./libraries/OrderTypes.sol";
import {ReservoirOracle} from "./libraries/ReservoirOracle.sol";

/**
 * @notice The Dyve Contract to handle lending and borrowing of NFTs
 */
contract Dyve is 
  ReentrancyGuard,
  Ownable,
  EIP712("Dyve", "1")
{
  using SafeERC20 for IERC20;
  using OrderTypes for OrderTypes.Order;
  using ReservoirOracle for ReservoirOracle.Message;

  IWhitelistedCurrencies public whitelistedCurrencies;
  IProtocolFeeManager public protocolFeeManager;

  address public protocolFeeRecipient;
  bytes4 public constant INTERFACE_ID_ERC721 = 0x80ac58cd;
  bytes4 public constant INTERFACE_ID_ERC1155 = 0xd9b67a26;

  mapping(address => uint256) public userMinOrderNonce;
  mapping(address => mapping(uint256 => bool)) private _isUserOrderNonceExecutedOrCancelled;
  mapping(bytes32 => Order) public orders;

  // The NFT's listing status
  enum OrderStatus {
    BORROWED,
    EXPIRED,
    CLOSED
  }

  struct Order {
    bytes32 orderHash;
    OrderType orderType;
    address payable lender;
    address payable borrower;
    address collection;
    uint256 tokenId;
    uint256 amount; // only applicable for ERC1155, set to 1 for ERC721
    uint256 expiryDateTime;
    uint256 collateral;
    address currency;
    bytes32 tokenFlaggingId;
    OrderStatus status;
  }

	error InvalidSigner();
	error ExpiredListing();
	error ExpiredNonce();
	error InvalidFee();
	error InvalidCollateral();
	error InvalidCurrency();
	error InvalidSignature();

  event CancelAllOrders(address indexed user, uint256 newMinNonce);
  event CancelMultipleOrders(address indexed user, uint256[] orderNonces);

  event OrderFulfilled(
    bytes32 orderHash, // ask hash of the maker order
    OrderType orderType,
    uint256 orderNonce,
    address indexed taker,
    address indexed maker,
    address collection,
    uint256 tokenId,
    uint256 amount,
    uint256 collateral,
    uint256 fee,
    address currency,
    uint256 duration,
    uint256 expiryDateTime,
    OrderStatus status
  );

  event Close(
    bytes32 orderHash,
    OrderType orderType,
    address indexed borrower, 
    address indexed lender, 
    address collection,
    uint256 tokenId,
    uint256 amount,
    uint256 returnedTokenId,
    uint256 collateral,
    address currency,
    OrderStatus status
  );

  event Claim(
    bytes32 orderHash,
    OrderType orderType,
    address indexed borrower,
    address indexed lender,
    address collection,
    uint256 tokenId,
    uint256 amount,
    uint256 collateral,
    address currency,
    OrderStatus status
  );

  /**
    * @notice Constructor
    * @param whitelistedCurrenciesAddress address of the WhitelistedCurrencies contract
    * @param protocolFeeManagerAddress address of the ProtocolFeeManager contract
    * @param _protocolFeeRecipient protocol fee recipient address
    */
  constructor(address whitelistedCurrenciesAddress, address protocolFeeManagerAddress, address _protocolFeeRecipient) {
    whitelistedCurrencies = IWhitelistedCurrencies(whitelistedCurrenciesAddress); 
    protocolFeeManager = IProtocolFeeManager(protocolFeeManagerAddress);
    protocolFeeRecipient = _protocolFeeRecipient;
  }

  /**
  * @notice Cancel all pending orders for a sender
  * @param minNonce minimum user nonce
  */
  function cancelAllOrdersForSender(uint256 minNonce) external {
    require(minNonce > userMinOrderNonce[msg.sender], "Cancel: Order nonce lower than current");
    require(minNonce < userMinOrderNonce[msg.sender] + 500000, "Cancel: Cannot cancel more orders");
    userMinOrderNonce[msg.sender] = minNonce;

    emit CancelAllOrders(msg.sender, minNonce);
  }

  /**
  * @notice Cancel maker orders
  * @param orderNonces array of order nonces
  */
  function cancelMultipleMakerOrders(uint256[] calldata orderNonces) external {
    require(orderNonces.length > 0, "Cancel: Cannot be empty");

    for (uint256 i = 0; i < orderNonces.length; i++) {
      require(orderNonces[i] >= userMinOrderNonce[msg.sender], "Cancel: Order nonce lower than current");
      _isUserOrderNonceExecutedOrCancelled[msg.sender][orderNonces[i]] = true;
    }

    emit CancelMultipleOrders(msg.sender, orderNonces);
  }

  /**
  * @notice Fullfills the order
  * @param order the order to be fulfilled
  */
  function fulfillOrder(OrderTypes.Order calldata order)
      external
      payable
      nonReentrant
  {
    require(
      (order.orderType != OrderType.ETH_TO_ERC721 && order.orderType != OrderType.ETH_TO_ERC1155) || msg.value == (order.fee + order.collateral),
      "Order: Incorrect amount of ETH sent"
    );
    require(
      order.orderType == OrderType.ETH_TO_ERC721 || order.orderType == OrderType.ETH_TO_ERC1155 || msg.value == 0, 
      "Order: ETH sent for an ERC20 type transaction"
    );

    // Check the maker ask order
    bytes32 orderHash = order.hash();
    _validateOrder(order, _hashTypedDataV4(orderHash)); // message

    // Update maker ask order status to true (prevents replay)
    _isUserOrderNonceExecutedOrCancelled[order.signer][order.nonce] = true;

    // Goes through the follwing procedure:
    // 1. Creates an order
    // 2. transfers the NFT to the borrower
    // 3. transfers the funds from the borrower to the respecitve recipients
    if (order.orderType == OrderType.ETH_TO_ERC721) {
      _createOrder(order, orderHash, order.signer, msg.sender);

      IERC721(order.collection).safeTransferFrom(order.signer, msg.sender, order.tokenId);

      _transferETH(order.signer, order.fee, order.premiumCollection, order.premiumTokenId);
    } else if (order.orderType == OrderType.ETH_TO_ERC1155) {
      _createOrder(order, orderHash, order.signer, msg.sender);

      IERC1155(order.collection).safeTransferFrom(order.signer, msg.sender, order.tokenId, order.amount, "");

      _transferETH(order.signer, order.fee, order.premiumCollection, order.premiumTokenId);
    } else if (order.orderType == OrderType.ERC20_TO_ERC721) {
      _createOrder(order, orderHash, order.signer, msg.sender);

      IERC721(order.collection).safeTransferFrom(order.signer, msg.sender, order.tokenId);

      _transferERC20(msg.sender, order.signer, order.fee, order.collateral, order.currency, order.premiumCollection, order.premiumTokenId); 
    } else if (order.orderType == OrderType.ERC20_TO_ERC1155) {
      _createOrder(order, orderHash, order.signer, msg.sender);

      IERC1155(order.collection).safeTransferFrom(order.signer, msg.sender, order.tokenId, order.amount, "");

      _transferERC20(msg.sender, order.signer, order.fee, order.collateral, order.currency, order.premiumCollection, order.premiumTokenId); 
    } else if (order.orderType == OrderType.ERC721_TO_ERC20) {
      _createOrder(order, orderHash, msg.sender, order.signer);

      IERC721(order.collection).safeTransferFrom(msg.sender, order.signer, order.tokenId);

      _transferERC20(order.signer, msg.sender, order.fee, order.collateral, order.currency, order.premiumCollection, order.premiumTokenId); 
    } else if (order.orderType == OrderType.ERC1155_TO_ERC20) {
      _createOrder(order, orderHash, msg.sender, order.signer);

      IERC1155(order.collection).safeTransferFrom(msg.sender, order.signer, order.tokenId, order.amount, "");

      _transferERC20(order.signer, msg.sender, order.fee, order.collateral, order.currency, order.premiumCollection, order.premiumTokenId);
    }

    emit OrderFulfilled(
      orderHash,
      order.orderType,
      order.nonce, 
      msg.sender,
      order.signer,
      order.collection, 
      order.tokenId, 
      order.amount,
      order.collateral, 
      order.fee, 
      order.currency, 
      order.duration, 
      orders[orderHash].expiryDateTime, 
      OrderStatus.BORROWED
    );
  }

  /**
  * @notice Return back an NFT to the lender and release collateral to the borrower
  * @dev we check that the borrower owns the incoming ID from the collection.
  * @param orderHash order hash of the maker order
  * @param returnTokenId the NFT to be returned
  * @param message the message from the oracle
  */
  function closePosition(bytes32 orderHash, uint256 returnTokenId, ReservoirOracle.Message calldata message) external {
    Order storage order = orders[orderHash];

    require(order.borrower == msg.sender, "Order: Borrower must be the sender");
    require(order.expiryDateTime > block.timestamp, "Order: Order expired");
    require(order.status == OrderStatus.BORROWED, "Order: Order is not borrowed");

    if (IERC165(order.collection).supportsInterface(INTERFACE_ID_ERC721)) {
      require(IERC721(order.collection).ownerOf(returnTokenId) == msg.sender, "Order: Borrower does not own the returning ERC721 token");
    } else {
      require(IERC1155(order.collection).balanceOf(msg.sender, returnTokenId) >= order.amount, "Order: Borrower does not own the sufficient amount of ERC1155 tokens to return");
    }

    // Validate the message
    uint256 maxMessageAge = 5 minutes;
    if (!ReservoirOracle._verifyMessage(order.tokenFlaggingId, maxMessageAge, message)) {
        revert ReservoirOracle.InvalidMessage();
    }
    (bool flaggedStatus, /* uint256 */) = abi.decode(message.payload, (bool, uint256)); 
    require(!flaggedStatus, "Order: Cannot return a flagged NFT");

    order.status = OrderStatus.CLOSED;

    // 1. Transfer the NFT back to the lender
    if (IERC165(order.collection).supportsInterface(INTERFACE_ID_ERC721)) {
      IERC721(order.collection).safeTransferFrom(order.borrower, order.lender, returnTokenId);
    } else {
      IERC1155(order.collection).safeTransferFrom(order.borrower, order.lender, returnTokenId, order.amount, "");
    }

    // 2. Transfer the collateral from dyve to the borrower
    if (order.orderType == OrderType.ETH_TO_ERC721 || order.orderType == OrderType.ETH_TO_ERC1155) {
      (bool success, ) = order.borrower.call{ value: order.collateral }("");
      require(success, "Order: Collateral transfer to borrower failed");
    } else {
      IERC20(order.currency).safeTransfer(order.borrower, order.collateral);
    }

    emit Close(
      order.orderHash,
      order.orderType,
      order.borrower,
      order.lender,
      order.collection,
      order.tokenId,
      order.amount,
      returnTokenId,
      order.collateral,
      order.currency,
      order.status
    );
  }

  /**
  * @notice Releases collateral to the lender for the expired borrow
  * @param orderHash order hash of the maker order
  */
  function claimCollateral(bytes32 orderHash) external {
    Order storage order = orders[orderHash];

    require(order.lender == msg.sender, "Order: Lender must be the sender");
    require(order.expiryDateTime <= block.timestamp, "Order: Order is not expired");
    require(order.status == OrderStatus.BORROWED, "Order: Order is not borrowed");
    
    order.status = OrderStatus.EXPIRED;

    // Transfer the collateral from dyve to the borrower
    if (order.orderType == OrderType.ETH_TO_ERC721 || order.orderType == OrderType.ETH_TO_ERC1155) {
      (bool success, ) = order.lender.call{ value: order.collateral }("");
      require(success, "Order: Collateral transfer to lender failed");
    } else {
      IERC20(order.currency).safeTransfer(order.lender, order.collateral);
    }

    emit Claim(
      order.orderHash,
      order.orderType,
      order.borrower,
      order.lender,
      order.collection,
      order.tokenId,
      order.amount,
      order.collateral,
      order.currency,
      order.status
    );
  }

  /**
  * @notice Creates an Order
  * @param order the order information
  * @param lender the lender of the order
  * @param borrower the borrower of the order
  */
  function _createOrder(
    OrderTypes.Order calldata order, bytes32 orderHash, address lender, address borrower
  ) internal {
    // create order for future processing (ie: closing and claiming)
    orders[orderHash] = Order({
      orderHash: orderHash,
      orderType: order.orderType,
      lender: payable(lender),
      borrower: payable(borrower),
      collection: order.collection,
      tokenId: order.tokenId,
      amount: order.amount,
      expiryDateTime: block.timestamp + order.duration,
      collateral: order.collateral,
      currency: order.currency,
      tokenFlaggingId: order.tokenFlaggingId,
      status: OrderStatus.BORROWED
    });
  }

  /** 
  * @notice Transfer fees and protocol fee to the Lender and procotol fee recipient respectively in ETH
  * @param to Address of recipient to receive the fees (Lender)
  * @param fee Fee amount being transffered to Lender
  * @param premiumCollection Address of the premium collection (Zero address if it doesn't exist)
  * @param premiumTokenId TokenId from the premium collection
  */
  function _transferETH(address to, uint256 fee, address premiumCollection, uint256 premiumTokenId) internal {
    uint256 protocolFee = (fee * protocolFeeManager.determineProtocolFeeRate(premiumCollection, premiumTokenId, to)) / 10000;
    bool success;

    // 1. Protocol fee transfer
    (success, ) = payable(protocolFeeRecipient).call{ value: protocolFee }("");
    require(success, "Order: Protocol fee transfer failed");

    // 2. Lender fee transfer
    (success, ) = payable(to).call{ value: fee - protocolFee }("");
    require(success, "Order: Lender fee transfer failed");
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
    uint256 protocolFee = (fee * protocolFeeManager.determineProtocolFeeRate(premiumCollection, premiumTokenId, to)) / 10000;

   // 1. Protocol fee transfer
    IERC20(currency).safeTransferFrom(from, protocolFeeRecipient, protocolFee);

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
  }

  /**
  * @notice updates the WhitelistedCurrencies instance
  * @param _whitelistedCurrencies the address of the new WhitelistedCurrencies
  */
  function updateWhitelistedCurrencies(address _whitelistedCurrencies) external onlyOwner {
    whitelistedCurrencies = IWhitelistedCurrencies(_whitelistedCurrencies);
  }

  /**
  * @notice Verify the validity of the maker order
  * @param order the order to be verified
  * @param orderHash computed hash for the order
  */
  function _validateOrder(OrderTypes.Order calldata order, bytes32 orderHash) internal view {
      // Verify the signer is not address(0)
      if (order.signer == address(0)) {
        revert InvalidSigner();
      } 

      // Verify the order listing is not expired
      if (order.endTime <= block.timestamp) {
        revert ExpiredListing();
      }

      // Verify whether the nonce has expired
      if (
        _isUserOrderNonceExecutedOrCancelled[order.signer][order.nonce]
        || order.nonce < userMinOrderNonce[order.signer]
      ) {
        revert ExpiredNonce();
      }

      // Verify the fee and collateral are not 0
      if (order.fee == 0) {
        revert InvalidFee();
      }
      if (order.collateral == 0) {
        revert InvalidCollateral();
      }

      // Verify that the currency is whitelisted
      if (
        order.orderType != OrderType.ETH_TO_ERC721
        && order.orderType != OrderType.ETH_TO_ERC1155
        && !(whitelistedCurrencies.isCurrencyWhitelisted(order.currency))
      ) {
        revert InvalidCurrency();
      }

      // Verify the validity of the signature
      if (
          !(SignatureChecker.isValidSignatureNow(
              order.signer,
              orderHash,
              order.signature
          ))
      ) {
        revert InvalidSignature();
      }
  }
}
