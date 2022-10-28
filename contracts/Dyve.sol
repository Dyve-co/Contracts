// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

// OZ libraries
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

// Dyve Interfaces
import {IEscrow} from "./interfaces/IEscrow.sol";
import {OrderTypes} from "./libraries/OrderTypes.sol";
import {SignatureChecker} from "./libraries/SignatureChecker.sol";

/**
 * @notice The Dyve Contract to handle short Selling of NFTs.
 * @dev implements the IERC721Receiver so we can use the safeTransferFrom mechanism.
 */
contract Dyve is ReentrancyGuard, Ownable {
  using OrderTypes for OrderTypes.MakerOrder;
  using OrderTypes for OrderTypes.TakerOrder;

  IEscrow public escrow;
  
  bytes32 public immutable DOMAIN_SEPARATOR;
  address public protocolFeeRecipient;

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
    ListingStatus status;
  }

  event TakerAsk(
    bytes32 orderHash, // ask hash of the maker order
    // uint256 orderNonce, // user order nonce
    address indexed taker,
    address indexed maker,
    address collection,
    uint256 tokenId,
    uint256 collateral,
    uint256 fee,
    uint256 expiryDateTime,
    ListingStatus status
  );

  event TakerBid(
    bytes32 orderHash, // ask hash of the maker order
    // uint256 orderNonce, // user order nonce
    address indexed taker,
    address indexed maker,
    address collection,
    uint256 tokenId,
    uint256 collateral,
    uint256 fee,
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
    ListingStatus status
  );

  event Claim(
    bytes32 orderHash,
    address indexed borrower,
    address indexed lender,
    address collection,
    uint256 tokenId,
    uint256 collateral,
    ListingStatus status
  );

  constructor(address _escrow, address _protocolFeeRecipient) {
    escrow = IEscrow(_escrow);
    protocolFeeRecipient = _protocolFeeRecipient;
    DOMAIN_SEPARATOR = keccak256(
      abi.encode(
          0x8b73c3c69bb8fe3d512ecc4cf759cc79239f7b179b0ffacaa9a75d522b39400f, // keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")
          0x5ba1c976ab8ccf6a5989edf209a623864756135194c073f47cac79e46eff2be3, // keccak256("Dyve")
          0xc89efdaa54c0f20c7adf612882df0950f5a951637e0307cdcb4c672f298b8bc6, // keccak256(bytes("1")) for versionId = 1
          block.chainid,
          address(this)
      )
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

    orders[askHash] = Order({
      orderHash: askHash,
      lender: payable(makerAsk.signer),
      borrower: payable(takerBid.taker),
      collection: makerAsk.collection,
      tokenId: makerAsk.tokenId,
      expiryDateTime: block.timestamp + makerAsk.duration,
      collateral: makerAsk.collateral,
      status: ListingStatus.BORROWED
    });

    _transferFeesAndFunds(makerAsk.signer, takerBid.fee, takerBid.collateral);

    IERC721(makerAsk.collection).safeTransferFrom(makerAsk.signer, takerBid.taker, makerAsk.tokenId);

    emit TakerBid(
      askHash,
      takerBid.taker,
      makerAsk.signer,
      makerAsk.collection,
      makerAsk.tokenId,
      takerBid.collateral,
      takerBid.fee,
      orders[askHash].expiryDateTime,
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

    require(IERC721(order.collection).ownerOf(returnTokenId) == msg.sender, "Order: Borrower does not own the returning NFT");
    require(order.borrower == msg.sender, "Order: Borrower must be the sender");
    require(order.expiryDateTime > block.timestamp, "Order: Order expired");
    require(order.status == ListingStatus.BORROWED, "Order: Order is not borrowed");

    order.status = ListingStatus.CLOSED;

    // 1. Transfer the NFT back to the lender
    IERC721(order.collection).safeTransferFrom(order.borrower, order.lender, returnTokenId);

    // 2. Transfer the collateral from the escrow account to the borrower
    require(address(escrow).balance >= order.collateral, "Order: insufficient escrow contract funds!");

    bool ok = escrow.releaseCollateral(order.borrower, order.collateral);
    require(ok, "Dyve: transfer of collateral from Dyve to borrower failed!");

    emit Close(
      order.orderHash,
      order.borrower,
      order.lender,
      order.collection,
      order.tokenId,
      returnTokenId,
      order.collateral,
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

    // 2. Transfer the collateral from the escrow account to the borrower
    require(address(escrow).balance >= order.collateral, "Order: insufficient escrow contract funds!");

    bool ok = escrow.releaseCollateral(order.lender, order.collateral);
    require(ok, "Dyve: transfer of collateral from Dyve to lender failed!");

    emit Claim(
      order.orderHash,
      order.borrower,
      order.lender,
      order.collection,
      order.tokenId,
      order.collateral,
      order.status
    );
  }

  // Helper functions
  /** 
  * @notice Transfer fees, collateral and protocol fee to the Lender, Escrow and procotol respectively
  * @param to Address of recipient to receive the fees (Lender)
  * @param fee Fee amount being transffered to Lender (in ETH)
  * @param collateral Collateral amount being deposited to Escrow (in ETH)
  */
  function _transferFeesAndFunds(address to, uint256 fee, uint256 collateral) internal {
    bool ok;

    // 1. Protocol fee
    {
      uint256 protocolFee = (fee * 2) / 100;
      (ok, ) = payable(protocolFeeRecipient).call{value: protocolFee}("");
      require(ok, "Dyve: Failed to transfer protocol fee");
    }

    // 2. Fee Transfer
    {
      (ok, ) = payable(to).call{value: fee}("");
      require(ok, "Dyve: Failed to transfer fee to lender");
    }

    // 3. Colalteral Transfer
    {
      (ok, ) = payable(address(escrow)).call{value: collateral}("");
      require(ok, "Dyve: Failed to send collateral to Escrow");
    }
  }

  /**
  * @notice Verify the validity of the maker order
  * @param makerOrder maker order
  * @param orderHash computed hash for the order
  */
  function _validateOrder(OrderTypes.MakerOrder calldata makerOrder, bytes32 orderHash) internal view {
      // Verify the signer is not address(0)
      require(makerOrder.signer != address(0), "Order: Invalid signer");

      // Verify the fee and collateral are not 0
      require(makerOrder.fee > 0, "Order: fee cannot be 0");
      require(makerOrder.collateral > 0, "Order: collateral cannot be 0");

      // bytes32 askHash = makerAsk.hash();
      // _validateOrder(makerAsk, askHash);
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

  function updateEscrow(address _escrow) external onlyOwner {
    require(_escrow != address(0), "Owner: Cannot be null address");
    escrow = IEscrow(_escrow);
  }
}
