// SPDX-License-Identifier: MIT
pragma solidity ^0.8.16;

// OZ libraries
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IERC20, SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IWETH} from "./interfaces/IWETH.sol";

// Dyve Interfaces
import {OrderTypes} from "./libraries/OrderTypes.sol";
import {SignatureChecker} from "./libraries/SignatureChecker.sol";
import "hardhat/console.sol";

/**
 * @notice The Dyve Contract to handle lending and borrowing of NFTs
 */
contract Dyve is ReentrancyGuard, Ownable {
  using SafeERC20 for IERC20;
  using OrderTypes for OrderTypes.MakerOrder;
  using OrderTypes for OrderTypes.TakerOrder;

  address public immutable WETH;
  bytes32 public immutable DOMAIN_SEPARATOR;

  address public protocolFeeRecipient;

  mapping(address => bool) public isCurrencyWhitelisted;
  mapping(address => uint256) public userMinOrderNonce;
  mapping(address => mapping(uint256 => bool)) private _isUserOrderNonceExecutedOrCancelled;
  mapping(bytes32 => Order) public orders;

  // The NFT's listing status
  enum ListingStatus {
    BORROWED,
    EXPIRED,
    CLOSED
  }

  struct Order {
    bytes32 orderHash;
    address payable lender;
    address payable borrower;
    address collection;
    uint256 tokenId;
    uint256 expiryDateTime;
    uint256 collateral;
    address currency;
    ListingStatus status;
  }

  event addCurrencyWhitelist(address indexed currency);
  event removeCurrencyWhitelist(address indexed currency);
  event CancelAllOrders(address indexed user, uint256 newMinNonce);
  event CancelMultipleOrders(address indexed user, uint256[] orderNonces);
  event TakerAsk(
    bytes32 orderHash, // ask hash of the maker order
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
    ListingStatus status
  );

  event TakerBid(
    bytes32 orderHash, // ask hash of the maker order
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
    ListingStatus status
  );

  event Close(
    bytes32 orderHash,
    address indexed borrower, 
    address indexed lender, 
    address collection,
    uint256 tokenId, 
    uint256 returnedTokenId,
    uint256 collateral,
    address currency,
    ListingStatus status
  );

  event Claim(
    bytes32 orderHash,
    address indexed borrower,
    address indexed lender,
    address collection,
    uint256 tokenId,
    uint256 collateral,
    address currency,
    ListingStatus status
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
  * @notice Match a takerBid with a matchAsk
  * @param takerBid taker bid order
  * @param makerAsk maker ask order
  */
  function matchAskWithTakerBidUsingETHAndWETH(OrderTypes.TakerOrder calldata takerBid, OrderTypes.MakerOrder calldata makerAsk)
      external
      payable
      nonReentrant
  {
    require((makerAsk.isOrderAsk) && (!takerBid.isOrderAsk), "Order: Wrong sides");
    require(makerAsk.currency == WETH, "Order: Currency must be WETH");
    require(msg.sender == takerBid.taker, "Order: Taker must be the sender");

    // If not enough ETH to cover the price, use WETH
    uint256 totalAmount = takerBid.collateral + takerBid.fee;
    if (totalAmount > msg.value) {
      IERC20(WETH).safeTransferFrom(msg.sender, address(this), (totalAmount - msg.value));
    } else {
      require(totalAmount == msg.value, "Order: Msg.value too high");
    }

    // Wrap ETH sent to this contract
    IWETH(WETH).deposit{value: msg.value}();

    // Check the maker ask order
    bytes32 askHash = makerAsk.hash();
    _validateOrder(makerAsk, askHash);

    // Update maker ask order status to true (prevents replay)
    _isUserOrderNonceExecutedOrCancelled[makerAsk.signer][makerAsk.nonce] = true;

    // create order for future processing (ie: closing and claiming)
    orders[askHash] = Order({
      orderHash: askHash,
      lender: payable(makerAsk.signer),
      borrower: payable(takerBid.taker),
      collection: makerAsk.collection,
      tokenId: makerAsk.tokenId,
      expiryDateTime: block.timestamp + makerAsk.duration,
      collateral: makerAsk.collateral,
      currency: makerAsk.currency,
      status: ListingStatus.BORROWED
    });

    // Transfer protocol fee to protocolFeeRecipient, lender fee to lender and collateral to this contract
    _transferFeesAndFundsWithWETH(makerAsk.signer, takerBid.fee, takerBid.collateral);

    // Transfer NFT to borrower
    IERC721(makerAsk.collection).safeTransferFrom(makerAsk.signer, takerBid.taker, makerAsk.tokenId);

    emit TakerBid(
      askHash,
      makerAsk.nonce,
      takerBid.taker,
      makerAsk.signer,
      makerAsk.collection,
      makerAsk.tokenId,
      takerBid.collateral,
      takerBid.fee,
      makerAsk.currency,
      makerAsk.duration,
      orders[askHash].expiryDateTime,
      ListingStatus.BORROWED
    );
  }



  /**
  * @notice Match a takerBid with a matchAsk
  * @param takerBid taker bid order
  * @param makerAsk maker ask order
  */
  function matchAskWithTakerBid(OrderTypes.TakerOrder calldata takerBid, OrderTypes.MakerOrder calldata makerAsk)
      external
      payable
      nonReentrant
  {
    require((makerAsk.isOrderAsk) && (!takerBid.isOrderAsk), "Order: Wrong sides");
    require(msg.sender == takerBid.taker, "Order: Taker must be the sender");

    // Check the maker ask order
    bytes32 askHash = makerAsk.hash();
    _validateOrder(makerAsk, askHash);

    // Update the nonce to prevent replay attacks
    _isUserOrderNonceExecutedOrCancelled[makerAsk.signer][makerAsk.nonce] = true;

    // create order for future processing (ie: closing and claiming)
    orders[askHash] = Order({
      orderHash: askHash,
      lender: payable(makerAsk.signer),
      borrower: payable(takerBid.taker),
      collection: makerAsk.collection,
      tokenId: makerAsk.tokenId,
      expiryDateTime: block.timestamp + makerAsk.duration,
      collateral: makerAsk.collateral,
      currency: makerAsk.currency,
      status: ListingStatus.BORROWED
    });

    // Transfer protocol fee to protocolFeeRecipient, lender fee to lender and collateral to this contract
    _transferFeesAndFunds(
      takerBid.taker,
      makerAsk.signer, 
      takerBid.fee,
      takerBid.collateral,
      makerAsk.currency
    );

    // Transfer NFT to borrower
    IERC721(makerAsk.collection).safeTransferFrom(makerAsk.signer, takerBid.taker, makerAsk.tokenId);

    emit TakerBid(
      askHash,
      makerAsk.nonce,
      takerBid.taker,
      makerAsk.signer,
      makerAsk.collection,
      makerAsk.tokenId,
      takerBid.collateral,
      takerBid.fee,
      makerAsk.currency,
      makerAsk.duration,
      orders[askHash].expiryDateTime,
      ListingStatus.BORROWED
    );
  }

    /**
     * @notice Match a takerAsk with a makerBid
     * @param takerAsk taker ask order
     * @param makerBid maker bid order
     */
    function matchBidWithTakerAsk(OrderTypes.TakerOrder calldata takerAsk, OrderTypes.MakerOrder calldata makerBid)
        external
        nonReentrant
    {
      require((!makerBid.isOrderAsk) && (takerAsk.isOrderAsk), "Order: Wrong sides");
      require(msg.sender == takerAsk.taker, "Order: Taker must be the sender");

      // Check the maker bid order
      bytes32 bidHash = makerBid.hash();
      _validateOrder(makerBid, bidHash);

      // Update maker bid order status to true (prevents replay)
      _isUserOrderNonceExecutedOrCancelled[makerBid.signer][makerBid.nonce] = true;

      // create order for future processing (ie: closing and claiming)
      orders[bidHash] = Order({
        orderHash: bidHash,
        lender: payable(takerAsk.taker),
        borrower: payable(makerBid.signer),
        collection: makerBid.collection,
        tokenId: makerBid.tokenId,
        expiryDateTime: block.timestamp + makerBid.duration,
        collateral: makerBid.collateral,
        currency: makerBid.currency,
        status: ListingStatus.BORROWED
      });

      // Transfer NFT to borrower
      IERC721(makerBid.collection).safeTransferFrom(takerAsk.taker, makerBid.signer, makerBid.tokenId);

      // Transfer protocol fee to protocolFeeRecipient, lender fee to lender and collateral to this contract
      _transferFeesAndFunds(
        makerBid.signer,
        takerAsk.taker,
        takerAsk.fee,
        takerAsk.collateral,
        makerBid.currency
      );

      emit TakerAsk(
        bidHash,
        makerBid.nonce,
        takerAsk.taker,
        makerBid.signer,
        makerBid.collection,
        makerBid.tokenId,
        takerAsk.collateral,
        takerAsk.fee,
        makerBid.currency,
        makerBid.duration,
        orders[bidHash].expiryDateTime,
        ListingStatus.BORROWED
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
    require(order.status == ListingStatus.BORROWED, "Order: Order is not borrowed");

    order.status = ListingStatus.CLOSED;

    // 1. Transfer the NFT back to the lender
    IERC721(order.collection).safeTransferFrom(order.borrower, order.lender, returnTokenId);

    // 2. Transfer the collateral from dyve to the borrower
    IERC20(order.currency).safeTransferFrom(address(this), order.borrower, order.collateral);

    emit Close(
      order.orderHash,
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
    require(order.status == ListingStatus.BORROWED, "Order: Order is not borrowed");

    order.status = ListingStatus.EXPIRED;

    // 1. Transfer the collateral from the escrow account to the borrower
    require(address(this).balance >= order.collateral, "Order: insufficient contract funds!");

    // 2. Transfer the collateral from dyve to the lender
    IERC20(order.currency).safeTransferFrom(address(this), order.lender, order.collateral);

    emit Claim(
      order.orderHash,
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
  * @notice Transfer fees, collateral and protocol fee to the Lender, Dyve and procotol fee recipient respectively in WETH
  * @param to Address of recipient to receive the fees (Lender)
  * @param fee Fee amount being transffered to Lender (in WETH)
  * @param collateral Collaterl amount being transffered to this address (in WETH)
  */
  function _transferFeesAndFundsWithWETH(address to, uint256 fee, uint256 collateral) internal {
    uint256 protocolFee = (fee * 2) / 100;

    // 1. Protocol fee transfer
    IERC20(WETH).safeTransfer(protocolFeeRecipient, protocolFee);

    // 2. Lender fee transfer
    IERC20(WETH).safeTransfer(to, fee - protocolFee);

    // 3. Collateral transfer
    IERC20(WETH).safeTransfer(address(this), collateral);
  }


  /** 
  * @notice Transfer fees, collateral and protocol fee to the Lender, Dyve and procotol fee recipient respectively
  * @param from Sender of the funds
  * @param to Address of recipient to receive the fees (Lender)
  * @param fee Fee amount being transffered to Lender
  * @param collateral Collaterl amount being transffered to this address
  * @param currency Currency of the ERC20 token to be transffered
  */
  function _transferFeesAndFunds(
    address from, 
    address to, 
    uint256 fee, 
    uint256 collateral, 
    address currency
  ) internal {
    uint256 protocolFee = (fee * 2) / 100;

    // 1. Protocol fee transfer
    IERC20(currency).safeTransferFrom(from, protocolFeeRecipient, protocolFee);

    // 2. Lender fee transfer
    IERC20(currency).safeTransferFrom(from, to, fee - protocolFee);

    // 3. Collateral transfer
    IERC20(currency).safeTransferFrom(from, address(this), collateral);
  }

  function addWhitelistedCurrency(address currency) external onlyOwner {
    isCurrencyWhitelisted[currency] = true;
    
    emit addCurrencyWhitelist(currency);
  }

  function removeWhitelistedCurrency(address currency) external onlyOwner {
    isCurrencyWhitelisted[currency] = false;
    
    emit removeCurrencyWhitelist(currency);
  }

  /**
  * @notice Verify the validity of the maker order
  * @param makerOrder maker order
  * @param orderHash computed hash for the order
  */
  function _validateOrder(OrderTypes.MakerOrder calldata makerOrder, bytes32 orderHash) internal view {
      // Verify the signer is not address(0)
      require(makerOrder.signer != address(0), "Order: Invalid signer");

      // Verify whether the nonce has expired
      require(
        (!_isUserOrderNonceExecutedOrCancelled[makerOrder.signer][makerOrder.nonce]) &&
          (makerOrder.nonce >= userMinOrderNonce[makerOrder.signer]),
        "Order: Matching order listing expired"
      );

      // Verify the fee and collateral are not 0
      require(makerOrder.fee > 0, "Order: fee cannot be 0");
      require(makerOrder.collateral > 0, "Order: collateral cannot be 0");

      // Verify that the currency is whitelisted
      require(isCurrencyWhitelisted[makerOrder.currency], "Order: currency not whitelisted");

      // Verify the validity of the signature
      require(
          SignatureChecker.verify(
              orderHash,
              makerOrder.signer,
              makerOrder.v,
              makerOrder.r,
              makerOrder.s,
              DOMAIN_SEPARATOR
          ),
          "Signature: Invalid"
      );
  }
}
