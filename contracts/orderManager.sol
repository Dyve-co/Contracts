// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

// OZ Libraries
import {IERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

// Dyve Interfaces
import {IOrderManager} from "./interfaces/IOrderManager.sol";

/**
 * @notice The Dyve Contract to handle manging user nonces
 */
contract OrderManager is IOrderManager {
  enum ListingStatus {
    BORROWED,
    EXPIRED,
    CLOSED
  }

  enum ReturnType {
    ANY,
    TRAIT,
    SAME
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

  event OrderCreation(
    bytes32 orderHash,
    address indexed lender,
    address indexed borrower,
    address collection,
    uint256 tokenId,
    uint256 expiryDateTime,
    uint256 collateral,
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
  
  mapping(bytes32 => Order) public orders;

  // VULENERBILITY HERE: anyone could make an order here, thus allowing 
  // malicious actors to make orders with high collateral and close those positions out
  function createOrder(
    bytes32 _orderHash,
    address payable _lender,
    address payable _borrower,
    address _collection,
    uint256 _tokenId,
    uint256 _expiryDateTime,
    uint256 _collateral
  ) external {
    orders[_orderHash] = Order({
      orderHash: _orderHash,
      lender: _lender,
      borrower: _borrower,
      collection: _collection,
      tokenId: _tokenId,
      expiryDateTime: _expiryDateTime,
      collateral: _collateral,
      status: ListingStatus.BORROWED
    });

    emit OrderCreation(
      _orderHash,
      _lender,
      _borrower,
      _collection,
      _tokenId,
      _expiryDateTime,
      _collateral,
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
    require(order.returnType == ReturnType.ANY || order.returnType == ReturnType.SAME && order.tokenId == returnTokenId, "Order: Return type does not match");
    // require(order.returnType == ReturnType.TRAIT) // needs to return back the same trait

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
}
