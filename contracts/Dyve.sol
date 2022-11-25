// SPDX-License-Identifier: MIT
pragma solidity ^0.8.16;

// OZ libraries
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IERC20, SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IWETH} from "./interfaces/IWETH.sol";

// Dyve Interfaces
import {OrderTypes, OrderType} from "./libraries/OrderTypes.sol";
import {SignatureChecker} from "./libraries/SignatureChecker.sol";
import "hardhat/console.sol";

/**
 * @notice The Dyve Contract to handle lending and borrowing of NFTs
 */
contract Dyve is ReentrancyGuard, Ownable {
  using SafeERC20 for IERC20;
  using OrderTypes for OrderTypes.Order;

  address public immutable WETH;
  bytes32 public immutable DOMAIN_SEPARATOR;

  address public protocolFeeRecipient;

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

  event addCurrencyWhitelist(address indexed currency);
  event removeCurrencyWhitelist(address indexed currency);
  event CancelAllOrders(address indexed user, uint256 newMinNonce);
  event CancelMultipleOrders(address indexed user, uint256[] orderNonces);

  event OrderFulfilled(
    bytes32 orderHash, // ask hash of the maker order
    OrderType orderType,
    uint256 orderNonce, // user order nonce
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
    * @param _WETH wrapped ether address (for other chains, use wrapped native asset)
    * @param _protocolFeeRecipient protocol fee recipient
    */
  constructor(address _WETH, address _protocolFeeRecipient) {
    DOMAIN_SEPARATOR = keccak256(
      abi.encode(
        0x8b73c3c69bb8fe3d512ecc4cf759cc79239f7b179b0ffacaa9a75d522b39400f, // keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")
        0x5ba1c976ab8ccf6a5989edf209a623864756135194c073f47cac79e46eff2be3, // keccak256("Dyve")
        0xc89efdaa54c0f20c7adf612882df0950f5a951637e0307cdcb4c672f298b8bc6, // keccak256(bytes("1")) for versionId = 1
        block.chainid,
        address(this)
      )
    );

    WETH = _WETH;
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
    require(order.orderType != OrderType.ETH_TO_ERC721 || msg.value == (order.fee + order.collateral), "Order: Incorrect amount of ETH sent");
    require(order.orderType == OrderType.ETH_TO_ERC721 || msg.value == 0, "Order: ETH sent for an ERC20 type transaction");

    // Check the maker ask order
    bytes32 orderHash = order.hash();
    _validateOrder(order, orderHash);

    // Update maker ask order status to true (prevents replay)
    _isUserOrderNonceExecutedOrCancelled[order.signer][order.nonce] = true;

    // Follows the follwing procedure:
    // 1. Creates an order
    // 2. transfers the NFT to the borrower
    // 3. transfers the funds from the borrower to the respecitve recipients
    if (order.orderType == OrderType.ETH_TO_ERC721) {
      _createOrder(order, orderHash, order.signer, msg.sender);

      IERC721(order.collection).safeTransferFrom(order.signer, msg.sender, order.tokenId);

      _transferETH(order.signer, order.fee);
    } else if (order.orderType == OrderType.ERC20_TO_ERC721) {
      _createOrder(order, orderHash, order.signer, msg.sender);

      IERC721(order.collection).safeTransferFrom(order.signer, msg.sender, order.tokenId);

      _transferERC20(msg.sender, order.signer, order.fee, order.collateral, order.currency);
    } else if (order.orderType == OrderType.ERC721_TO_ERC20) {
      _createOrder(order, orderHash, msg.sender, order.signer);

      IERC721(order.collection).safeTransferFrom(msg.sender, order.signer, order.tokenId);

      _transferERC20(order.signer, msg.sender, order.fee, order.collateral, order.currency);
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
  * @notice Transfer fees and protocol fee to the Lender and procotol fee recipient respectively in ETH
  * @param to Address of recipient to receive the fees (Lender)
  * @param fee Fee amount being transffered to Lender
  */
  function _transferETH(address to, uint256 fee) internal {
    uint256 protocolFee = (fee * 2) / 100;
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
  */
  function _transferERC20(address from, address to, uint256 fee, uint256 collateral, address currency) internal {
    uint256 protocolFee = (fee * 2) / 100;

   // 1. Protocol fee transfer
    IERC20(currency).safeTransferFrom(from, protocolFeeRecipient, protocolFee);

    // 2. Lender fee transfer
    IERC20(currency).safeTransferFrom(from, to, fee - protocolFee);

    // 3. Collateral transfer
    IERC20(currency).safeTransferFrom(from, address(this), collateral);
  }

  /**
  * @notice adds the specified currency to the list of supported currencies
  * @param currency the address of the currency to be added
  */
  function addWhitelistedCurrency(address currency) external onlyOwner {
    isCurrencyWhitelisted[currency] = true;
    
    emit addCurrencyWhitelist(currency);
  }

  /**
  * @notice removes the specified currency from the list of supported currencies
  * @param currency the address of the currency to be removed
  */
  function removeWhitelistedCurrency(address currency) external onlyOwner {
    isCurrencyWhitelisted[currency] = false;
    
    emit removeCurrencyWhitelist(currency);
  }

  /**
  * @notice Verify the validity of the maker order
  * @param order the order to be verified
  * @param orderHash computed hash for the order
  */
  function _validateOrder(OrderTypes.Order calldata order, bytes32 orderHash) internal view {
      // Verify the signer is not address(0)
      require(order.signer != address(0), "Order: Invalid signer");

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

      // Verify the validity of the signature
      require(
          SignatureChecker.verify(
              orderHash,
              order.signer,
              order.v,
              order.r,
              order.s,
              DOMAIN_SEPARATOR
          ),
          "Signature: Invalid"
      );
  }
}
