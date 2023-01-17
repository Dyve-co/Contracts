// SPDX-License-Identifier: MIT
pragma solidity ^0.8.16;

// OZ libraries
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IERC20, SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

// Dyve Interfaces
import {OrderTypes, OrderType} from "./libraries/OrderTypes.sol";
import {ReservoirOracle} from "./libraries/ReservoirOracle.sol";
import {IWETH} from "./interfaces/IWETH.sol";

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

  address public protocolFeeRecipient;

  mapping(address => uint256) public premiumCollections;
  mapping(address => bool) public isCurrencyWhitelisted;
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
    uint256 expiryDateTime;
    uint256 collateral;
    address currency;
    OrderStatus status;
  }

  event AddCurrencyToWhitelist(address indexed currency);
  event RemoveCurrencyFromWhitelist(address indexed currency);
  event AddPremiumCollection(address indexed collection, uint256 reducedFeeRate);
  event RemovePremiumCollection(address indexed collection);
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
    uint256 collateral,
    address currency,
    OrderStatus status
  );

  /**
    * @notice Constructor
    * @param _protocolFeeRecipient protocol fee recipient
    */
  constructor(address _protocolFeeRecipient) {
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
  function fulfillOrder(OrderTypes.Order calldata order) // ReservoirOracle.Message calldata message
      external
      payable
      nonReentrant
  {
    require(order.orderType != OrderType.ETH_TO_ERC721 || msg.value == (order.fee + order.collateral), "Order: Incorrect amount of ETH sent");
    require(order.orderType == OrderType.ETH_TO_ERC721 || msg.value == 0, "Order: ETH sent for an ERC20 type transaction");

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
    } else if (order.orderType == OrderType.ERC20_TO_ERC721) {
      _createOrder(order, orderHash, order.signer, msg.sender);

      IERC721(order.collection).safeTransferFrom(order.signer, msg.sender, order.tokenId);

      _transferERC20(msg.sender, order.signer, order.fee, order.collateral, order.currency, order.premiumCollection, order.premiumTokenId); 
    } else if (order.orderType == OrderType.ERC721_TO_ERC20) {
      _createOrder(order, orderHash, msg.sender, order.signer);

      IERC721(order.collection).safeTransferFrom(msg.sender, order.signer, order.tokenId);

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
  */
  function closePosition(bytes32 orderHash, uint256 returnTokenId) external {
    Order storage order = orders[orderHash];

    require(order.borrower == msg.sender, "Order: Borrower must be the sender");
    require(IERC721(order.collection).ownerOf(returnTokenId) == msg.sender, "Order: Borrower does not own the returning ERC721 token");
    require(order.expiryDateTime > block.timestamp, "Order: Order expired");
    require(order.status == OrderStatus.BORROWED, "Order: Order is not borrowed");

    order.status = OrderStatus.CLOSED;

    // 1. Transfer the NFT back to the lender
    IERC721(order.collection).safeTransferFrom(order.borrower, order.lender, returnTokenId);

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
      expiryDateTime: block.timestamp + order.duration,
      collateral: order.collateral,
      currency: order.currency,
      status: OrderStatus.BORROWED
    });
  }

  /** 
  * @notice Determines the protocol fee to charge based on whether the lender owns an NFT from a premium collection
  * @dev If the rate is set to 1, apply no fee
  * @param collateral collateral amount being transffered to the Dyve
  * @param collection Collection address of one of the potential premium collections
  * @param tokenId from one of the potential premium collections
  * @param lender Address of the lender
  */
  function _determineProtocolFee(uint256 collateral, address collection, uint256 tokenId, address lender) internal view returns (uint256) {
    uint256 protocolRate = 200;

    // initial check of collection != address(0) should be more gas efficient than checking the mapping
    if (collection != address(0) && premiumCollections[collection] > 0 && IERC721(collection).ownerOf(tokenId) == lender) { 
      if (premiumCollections[collection] == 1) {
        protocolRate = 0;
      } else {
        protocolRate = premiumCollections[collection];
      }
    }

    return (collateral * protocolRate) / 10000;
  }

  /** 
  * @notice Transfer fees and protocol fee to the Lender and procotol fee recipient respectively in ETH
  * @param to Address of recipient to receive the fees (Lender)
  * @param fee Fee amount being transffered to Lender
  * @param premiumCollection Address of the premium collection (Zero address if it doesn't exist)
  * @param premiumTokenId TokenId from the premium collection
  */
  function _transferETH(address to, uint256 fee, address premiumCollection, uint256 premiumTokenId) internal {
    uint256 protocolFee = _determineProtocolFee(fee, premiumCollection, premiumTokenId, to);
    bool success;

    // 1. Protocol fee transfer
    (success, ) = payable(protocolFeeRecipient).call{ value: protocolFee }("");
    require(success, "Order: Protocol fee transfer failed");

    // 2. Lender fee transfer
    (success, ) = payable(to).call{ value: fee }("");
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
    uint256 protocolFee = _determineProtocolFee(fee, premiumCollection, premiumTokenId, to);

   // 1. Protocol fee transfer
    IERC20(currency).safeTransferFrom(from, protocolFeeRecipient, protocolFee);

    // 2. Lender fee transfer
    IERC20(currency).safeTransferFrom(from, to, fee);

    // 3. Collateral transfer
    IERC20(currency).safeTransferFrom(from, address(this), collateral);
  }

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

  /**
  * @notice Returns the domain separator for the current chain (EIP-712)
  */
  function DOMAIN_SEPARATOR() external view returns(bytes32) {
      return _domainSeparatorV4();
  }

  /**
  * @notice Verify the validity of the maker order
  * @param order the order to be verified
  * @param orderHash computed hash for the order
  */
  function _validateOrder(OrderTypes.Order calldata order, bytes32 orderHash) internal view { // ReservoirOracle.Message calldata message
      // Verify the signer is not address(0)
      require(order.signer != address(0), "Order: Invalid signer");

      // Verify the order listing is not expired
      require(order.endTime > block.timestamp, "Order: Order listing expired");

      // Verify whether the nonce has expired
      require(
        (!_isUserOrderNonceExecutedOrCancelled[order.signer][order.nonce]) &&
          (order.nonce >= userMinOrderNonce[order.signer]),
        "Order: Matching order listing expired"
      );

      // Verify the fee and collateral are not 0
      require(order.fee > 0, "Order: fee cannot be 0");
      require(order.collateral > 0, "Order: collateral cannot be 0");

      // Verify that the currency is whitelisted
      require(order.orderType == OrderType.ETH_TO_ERC721 || isCurrencyWhitelisted[order.currency], "Order: currency not whitelisted");

      // Verify that the NFT is not flagged as stolen
      // uint256 maxMessageAge = 5 minutes;
      // if (!ReservoirOracle._verifyMessage(message.id, maxMessageAge, message)) {
      //     revert ReservoirOracle.InvalidMessage();
      // }

      // Verify the validity of the signature
      require(
          SignatureChecker.isValidSignatureNow(
              order.signer,
              orderHash,
              order.signature
          ),
          "Signature: Invalid"
      );
  }
}
