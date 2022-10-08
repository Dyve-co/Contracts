// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

// The interface to call NFT functionality from Dyve:
interface IERC721 {
    function safeTransferFrom(address from, address to, uint256 tokenId) external;
    function approve(address to, uint256 tokenId) external;
    function ownerOf(uint256 tokenID) external view returns (address);
    function name() external view returns (string memory);
    function symbol() external view returns (string memory);
}

/**
 * @notice The Dyve Contract to handle short Selling of NFTs.
 * @dev implements the IERC721Receiver so we can use the safeTransferFrom mechanism.
 */
contract Dyve is IERC721Receiver {
  uint256 counter_dyveId;  // store new listings uniquely @TODO: Should we represent this ID as a hash of the listing?
  // All listed NFTs up for lending
  mapping(uint256 => Listing) public listings;
  mapping(uint256 => bool) public claimed_collateral; // track which Dyve listing has claimed collateral
  mapping(bytes32 => bool) public nft_has_open_listing;  // track an open listing against indivual NFTs, (individual NFT) => (dyveId)

  // The NFT's listing status
  enum ListingStatus {
    LISTED,
    BORROWED,
    EXPIRED,
    CLOSED
  }

  // A listing of an NFT on the website to be lent out
  struct Listing {
    uint256 dyveId;
    address payable lender;
    address payable borrower;
    uint256 expiryDateTime;
    uint256 duration; 
    address collection;
    uint256 tokenId;
    uint256 collateral;
    uint256 fee;
    ListingStatus status;
  }

  // OFF-CHAIN
  event Cancel(address indexed borrower, address indexed lender, uint256 dyveId, uint256 tokenId);
  event Update(uint256 dyveId, uint256 newFee, uint256 newCollateral, uint256 newDuration);
  event List(
    address indexed lender, 
    uint256 dyveId, 
    uint256 tokenId,
    address collection,
    uint256 duration,
    uint256 collateral,
    uint256 fee,
    ListingStatus status
  );

  event Borrow(
    address indexed borrower,
    address indexed lender,
    uint256 dyveId,
    uint256 tokenId,
    address collection,
    uint256 duration,
    uint256 collateral,
    uint256 fee,
    uint256 expiryDateTime,
    ListingStatus status
  );
  event Close(
    address indexed borrower, 
    address indexed lender, 
    uint256 dyveId, 
    uint256 tokenId, 
    address collection,
    uint256 collateral,
    uint256 returnedTokenId,
    ListingStatus status
  );
  event Claim(
    address indexed borrower,
    address indexed lender,
    uint256 dyveId,
    uint256 tokenId,
    address collection,
    uint256 collateral,
    ListingStatus status
  );

  /**
   * @notice Get listing details.
   * @param dyveId the Dyve ID.
   */
  function getListing(uint256 dyveId) mustExist(dyveId) external view returns (Listing memory) {
    return listings[dyveId];
  }

  /**
   * @notice Get all listings held by Dyve.
   */
  function getAllListings() external view returns (Listing[] memory) {
      Listing[] memory _listings = new Listing[](counter_dyveId);
      for (uint256 i; i < _listings.length; i++) {
        _listings[i] = listings[i + 1];
      }
      return _listings;
  }

  /**
   * @notice List the NFT on Dyve as lender for someone to borrow and short sell.
   * @param _collection The NFT Collection address.
   * @param _tokenId The NFT Collection identifier from the _collection.
   * @param _collateral the Collateral required from a borrower (later on when calling borrow) to borrow this item.
   * @param _fee the Fee taken by the lender.
   * @param _duration the Duration of the listing in seconds.
   */
  function list(address _collection, uint256 _tokenId, uint256 _collateral, uint256 _fee, uint256 _duration) external {
      require(!nft_has_open_listing[_hashNFT(_collection, _tokenId)], "Already listed!");
      require(_collateral > 0, "Collateral must be greater than 0");
      require(_fee > 0, "Fee must be greater than 0");
      require(_duration > 0, "Duration must be greater than 0");

      counter_dyveId += 1;
      nft_has_open_listing[_hashNFT(_collection, _tokenId)] = true;

      listings[counter_dyveId] = Listing({
            dyveId: counter_dyveId,
            lender: payable(msg.sender),
            borrower: payable(0),
            expiryDateTime: 0,
            duration: _duration,
            collection: _collection,
            tokenId: _tokenId,
            collateral: _collateral,
            fee: _fee,
            status: ListingStatus.LISTED
      });

      // Step 2: Transfer NFT from seller to us
      // @dev THIS REQUIRES THAT WE HAVE CALLED THE NFT CONTRACT TO APPROVE US ON BEHALF OF THE USER!
      IERC721(_collection).safeTransferFrom(msg.sender, address(this), _tokenId);

      emit List(msg.sender, counter_dyveId, _tokenId, _collection, _duration, _collateral, _fee, ListingStatus.LISTED);
  }

  /**
   * @notice helper to hash an individual NFT for internal state tracking purposes.
   */
  function _hashNFT(address _collection, uint256 _nftID) private pure returns(bytes32) {
    return keccak256(abi.encodePacked(_collection, _nftID));
  }

  /**
   * @notice Make sure the dyveId is valid.
   * @param dyveId the unique Dyve ID. Must be at least something that exists.
   */
  modifier mustExist(uint256 dyveId) {
      require(dyveId <= counter_dyveId, "This listing does not exist!");
      _;
  }

  /**
   * @notice Make sure the listing has not been closed!
   * @param dyveId the Dyve ID of the listing.
   */
  modifier mustNotBeExpiredOrClosed(uint256 dyveId) {
    require((!(listings[dyveId].status == ListingStatus.CLOSED) &&
             !(listings[dyveId].status == ListingStatus.EXPIRED)) &&
              (listings[dyveId].expiryDateTime > 0) &&
              (listings[dyveId].expiryDateTime > block.timestamp)
             , "Closed or Expired!");
    _;
  }

  /**
   * @notice Check that a listing is open to be bought to short or borrowed.
   * @dev aka the listing is LISTED
   */
  modifier mustBeListed(uint256 dyveId) {
    require(listings[dyveId].status == ListingStatus.LISTED, "Not listed!");
    _;
  }

  /**
   * @notice Gives the borrower the ability to borrow from the lender. Need to return the same ID later.
   * @param dyveId The Dyve ID of the listing.
   */
  function borrow(uint256 dyveId) external payable mustExist(dyveId) mustBeListed(dyveId) {
    Listing storage listing = listings[dyveId];

    require(listing.status == ListingStatus.LISTED, "this listing needs to be listed!");
    require(listing.collateral + listing.fee <= msg.value, "Insufficient funds!");

    listing.status = ListingStatus.BORROWED;
    listing.borrower = payable(msg.sender);
    listing.expiryDateTime = block.timestamp + listing.duration;

    (bool ok,) = payable(listing.lender).call{value: listing.fee}("");
    require(ok, "transfer of fee to seller failed!");

    // transfer the NFT to the borrower
    IERC721(listing.collection).safeTransferFrom(address(this), msg.sender, listing.tokenId);

    emit Borrow(
      msg.sender,
      listing.lender,
      dyveId,
      listing.tokenId,
      listing.collection,
      listing.duration,
      listing.collateral,
      listing.fee,
      listing.expiryDateTime,
      listing.status
    );
    // collateral is stored as ETH in the contract @TODO: Store this in a mapping.
  }
  
  /**
   * @notice Close an open Short position. The borrower specifies the ID in the collection they are returning.
   * @dev we check that the borrower owns the incoming ID from the collection.
   * @param dyveId the Dyve ID of the listing we are closing.
   * @param _returnTokenId the ID of the NFT item from the collection that the borrower is returning
   */
  function closePosition(uint256 dyveId, uint256 _returnTokenId) external payable mustExist(dyveId) mustNotBeExpiredOrClosed(dyveId) {

        // TODO can we save gas by loading into memory, then make changes, then store back?
        Listing storage listing = listings[dyveId];

        // Require that the borrower owns it from the collection:
        require(keccak256(abi.encodePacked(IERC721(listing.collection).ownerOf(_returnTokenId))) == keccak256(abi.encodePacked(listing.borrower)), "the borrower does not own the incoming NFT");

        if (listing.status == ListingStatus.BORROWED) {
          // the ID needs to match in case of a pure borrow
          require(listing.tokenId == _returnTokenId, "The item returned is not the same!");
        }

        // make listing changes
        listing.status = ListingStatus.CLOSED;

        // move the incoming NFT from borrower to lender -- the lender is made whole
        IERC721(listing.collection).safeTransferFrom(listing.borrower, listing.lender, _returnTokenId);

        // unlock and transfer collateral from dyve to lender
        require(address(this).balance >= listing.collateral, "insufficient contract funds!");

        if (!claimed_collateral[dyveId]) {
          (bool ok, ) = payable(listing.borrower).call{value: listing.collateral}("");
          require(ok, "transfer of collateral from Dyve to lender failed!");

          claimed_collateral[dyveId] = true;
        }

        emit Close(
          listing.borrower,
          listing.lender,
          listing.dyveId,
          listing.tokenId,
          listing.collection,
          listing.collateral,
          _returnTokenId,
          listing.status
        );

        nft_has_open_listing[_hashNFT(listing.collection, listing.tokenId)] = false;
  }

  /**
   * @notice Cancel an active listing (which has not been lent out yet!).
   * @param dyveId The Dyve ID of the listing to cancel.
   */
  function cancel(uint256 dyveId) external mustExist(dyveId) mustBeListed(dyveId){
    Listing storage listing = listings[dyveId];
    require(listing.lender == msg.sender, "Not authorized!");

    listings[dyveId].status = ListingStatus.CLOSED;

    // transfer the NFT back to the lender (will require approval)
    IERC721(listing.collection).safeTransferFrom(address(this), msg.sender, listing.tokenId);

    emit Cancel(listing.borrower, listing.lender, listing.dyveId, listing.tokenId);

    nft_has_open_listing[_hashNFT(listing.collection, listing.tokenId)] = false;
  }

  /**
   * @notice update a listing with a new fee.
   * @param dyveId the Dyve ID/listing to update.
   * @param _fee the new fee for the listing.
   * @param _collateral the new collateral for the listing.
   * @param _duration the new duration for the listing.
   */
  function update(uint256 dyveId, uint256 _fee, uint256 _collateral, uint256 _duration) external mustExist(dyveId) mustBeListed(dyveId) {
    require(_fee > 0, "fee must be greater than 0");
    require(_collateral > 0, "collateral must be greater than 0");
    require(_duration > 0, "duration must be greater than 0");

    listings[dyveId].fee = _fee;
    listings[dyveId].collateral = _collateral;
    listings[dyveId].duration = _duration;

    emit Update(dyveId, _fee, _collateral, _duration);
  }

  /**
   * @notice Claim collateral in the event of the listing expiring (the borrower being unresponsive, e.g.).
   * @param dyveId the Dyve ID of the listing to update.
   * @dev the listing must exist. Must not already be closed and expired
   */
  function claimCollateral(uint256 dyveId) external payable mustExist(dyveId) {
    Listing memory listing = listings[dyveId];

    if(
      (listing.status == ListingStatus.BORROWED) &&
      (listing.expiryDateTime > 0) &&
      (block.timestamp >= listing.expiryDateTime)
    )
    {
      // transfer the collateral from Dyve to the lender because the listing expired!
      listings[dyveId].status = ListingStatus.EXPIRED;

      require(address(this).balance >= listing.collateral, "Insufficient funds to transfer");

      if (!claimed_collateral[dyveId]) {
        (bool ok, ) = payable(listing.lender).call{value: listing.collateral}("");
        require(ok, "Transfer failed!");

        claimed_collateral[dyveId] = true;
      }

      emit Claim(
        listing.borrower,
        listing.lender,
        listing.dyveId,
        listing.tokenId,
        listing.collection,
        listing.collateral,
        listing.status
      );

      nft_has_open_listing[_hashNFT(listing.collection, listing.tokenId)] = false;
    }
  }

  /**
   * @notice Implemented to support the Safe Transfer mechanism.
   */
  function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
  }
}
