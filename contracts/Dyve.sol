// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

// The interface to call NFT functionality from Dyve:
interface IERC721 {
    function safeTransferFrom(address from, address to, uint256 tokenId) external;
    function approve(address to, uint256 tokenId) external;
    function ownerOf(uint tokenID) external view returns (address);
    function name() external view returns (string memory);
    function symbol() external view returns (string memory);
}

/**
 * @notice The Dyve Contract to handle short Selling of NFTs.
 * @dev implements the IERC721Receiver so we can use the safeTransferFrom mechanism.
 */
contract Dyve is IERC721Receiver {

  event ListingEvent(address indexed lender, uint dyveId, uint nftcollectionID);
  event Borrow(address indexed borrower, address indexed lender, uint dyveId, uint nftcollectionID);
  event BuyToShort(address indexed borrower, address indexed lender, uint dyveId, uint nftcollectionID);
  event Close(address indexed borrower, address indexed lender, uint dyveId, uint originalNFTcollectionID, uint returnedNFTCollectionID);
  event Expired(address indexed borrower, address indexed lender, uint dyveId);
  event Cancel(address indexed borrower, address indexed lender, uint dyveId, uint NFTcollectionID);
  event Update(uint dyveId, uint256 newFee);

  uint counter_dyveID;  // store new listings uniquely @TODO: Should we represent this ID as a hash of the listing?
  // All listed NFTs up for lending
  mapping(uint256 => Listing) public listings;
  mapping(uint256 => bool) public claimed_collateral; // track which Dyve listing has claimed collateral
  mapping(bytes32 => bool) public nft_has_open_listing;  // track an open listing against indivual NFTs, (individual NFT) => (dyveID)

  // The NFT's listing status
  enum ListingStatus {
    LISTED,
    SHORTED,
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
    address NFTCollectionAddress;
    uint256 NFTCollectionID;
    uint256 collateral;
    uint256 fee;
    ListingStatus status;
  }

  /**
   * @notice Get listing details.
   * @param dyveID the Dyve ID.
   */
  function getListing(uint dyveID) mustExist(dyveID) external view returns (Listing memory) {
    return listings[dyveID];
  }

  /**
   * @notice Get all listings held by Dyve.
   */
  function getAllListings() external view returns (Listing[] memory) {
      Listing[] memory _listings = new Listing[](counter_dyveID);
      for (uint i; i < _listings.length; i++) {
        _listings[i] = listings[i];
      }
      return _listings;
  }

  /**
   * @notice List the NFT on Dyve as lender for someone to borrow and short sell.
   * @param _NFTCollectionAddress The NFT Collection address.
   * @param _NFTCollectionID The NFT Collection identifier from the _NFTCollectionAddress.
   * @param _required_collateral the Collateral required from a borrower (later on when calling borrow) to borrow this item.
   * @param _fee the Fee taken by the lender.
   */
  function list(address _NFTCollectionAddress, uint _NFTCollectionID, uint _required_collateral, uint _fee) external {
      require(!nft_has_open_listing[_hashNFT(_NFTCollectionAddress, _NFTCollectionID)], "Already listed!");

      counter_dyveID += 1;
      nft_has_open_listing[_hashNFT(_NFTCollectionAddress, _NFTCollectionID)] = true;

      listings[counter_dyveID] = Listing({
            dyveId: counter_dyveID,
            lender: payable(msg.sender),
            borrower: payable(0),
            expiryDateTime: block.timestamp + 14 days,
            NFTCollectionAddress: _NFTCollectionAddress,
            NFTCollectionID: _NFTCollectionID,
            collateral: _required_collateral,
            fee: _fee,
            status: ListingStatus.LISTED
      });

      // Step 2: Transfer NFT from seller to us
      // @dev THIS REQUIRES THAT WE HAVE CALLED THE NFT CONTRACT TO APPROVE US ON BEHALF OF THE USER!
      IERC721(_NFTCollectionAddress).safeTransferFrom(msg.sender, address(this), _NFTCollectionID);

      emit ListingEvent(msg.sender, counter_dyveID, _NFTCollectionID);
  }

  /**
   * @notice helper to hash an individual NFT for internal state tracking purposes.
   */
  function _hashNFT(address _nftcollectionAddress, uint256 _nftID) private pure returns(bytes32) {
    return keccak256(abi.encodePacked(_nftcollectionAddress, _nftID));
  }

  /**
   * @notice Make sure the dyveID is valid.
   * @param dyveID the unique Dyve ID. Must be at least something that exists.
   */
  modifier mustExist(uint dyveID) {
      require(dyveID <= counter_dyveID, "This listing does not exist!");
      _;
  }

  /**
   * @notice Make sure the listing has not been closed!
   * @param dyveID the Dyve ID of the listing.
   */
  modifier mustNotBeExpiredOrClosed(uint dyveID) {
    require((!(listings[dyveID].status == ListingStatus.CLOSED) &&
             !(listings[dyveID].status == ListingStatus.EXPIRED))
             , "Closed or Expired!");
    _;
  }

  /**
   * @notice Check that a listing is open to be bought to short or borrowed.
   * @dev aka the listing is LISTED
   */
  modifier mustBeListed(uint dyveID) {
    require(listings[dyveID].status == ListingStatus.LISTED, "Not listed!");
    _;
  }

  /**
   * @notice Borrow a listing that a lender previously provided.
   * @dev the listing was created in the past when list(...) was called. We are operating on that.
   * @param dyveID the internal Dyve ID of the listing.
   */
  function buyToShort(uint256 dyveID) external payable mustExist(dyveID) mustBeListed(dyveID) {
    Listing storage listing = listings[dyveID];

    require(listing.status == ListingStatus.LISTED, "this listing needs to be listed!");
    require(listing.collateral + listing.fee <= msg.value, "Insufficient funds!");

    listing.status = ListingStatus.SHORTED;
    listing.borrower = payable(msg.sender);

    (bool ok,) = payable(listing.lender).call{value: listing.fee}("");
    require(ok, "transfer of fee to seller failed!");

    // transfer the NFT to the borrower
    IERC721(listing.NFTCollectionAddress).safeTransferFrom(address(this), msg.sender, listing.NFTCollectionID);

    emit BuyToShort(msg.sender, listing.lender, dyveID, listing.NFTCollectionID);
    // collateral is stored as ETH in the contract @TODO: Store this in a mapping.
  }
  
  /**
   * @notice Gives the borrower the ability to borrow from the lender. Need to return the same ID later.
   * @param dyveID The Dyve ID of the listing.
   */
  function borrow(uint256 dyveID) external payable mustExist(dyveID) mustBeListed(dyveID) {
    Listing storage listing = listings[dyveID];

    require(listing.status == ListingStatus.LISTED, "this listing needs to be listed!");
    require(listing.collateral + listing.fee <= msg.value, "Insufficient funds!");

    listing.status = ListingStatus.BORROWED;
    listing.borrower = payable(msg.sender);

    (bool ok,) = payable(listing.lender).call{value: listing.fee}("");
    require(ok, "transfer of fee to seller failed!");

    // transfer the NFT to the borrower
    IERC721(listing.NFTCollectionAddress).safeTransferFrom(address(this), msg.sender, listing.NFTCollectionID);

    emit Borrow(msg.sender, listing.lender, dyveID, listing.NFTCollectionID);
    // collateral is stored as ETH in the contract @TODO: Store this in a mapping.
  }
  
  /**
   * @notice Close an open Short position. The borrower specifies the ID in the collection they are returning.
   * @dev we check that the borrower owns the incoming ID from the collection.
   * @param dyveID the Dyve ID of the listing we are closing.
   * @param _replacementNFTID the ID of the NFT item from the collection that the borrower is returning
   */
  function closePosition(uint256 dyveID, uint _replacementNFTID) external payable mustExist(dyveID) mustNotBeExpiredOrClosed(dyveID) {

        // TODO can we save gas by loading into memory, then make changes, then store back?
        Listing storage listing = listings[dyveID];

        // Require that the borrower owns it from the collection:
        require(keccak256(abi.encodePacked(IERC721(listing.NFTCollectionAddress).ownerOf(_replacementNFTID))) == keccak256(abi.encodePacked(listing.borrower)), "the borrower does not own the incoming NFT");

        if (listing.status == ListingStatus.BORROWED) {
          // the ID needs to match in case of a pure borrow
          require(listing.NFTCollectionID == _replacementNFTID, "The item returned is not the same!");
        }

        // make listing changes
        listing.status = ListingStatus.CLOSED;

        // move the incoming NFT from borrower to lender -- the lender is made whole
        IERC721(listing.NFTCollectionAddress).safeTransferFrom(listing.borrower, listing.lender, _replacementNFTID);

        // unlock and transfer collateral from dyve to lender
        require(address(this).balance >= listing.collateral, "insufficient contract funds!");

        if (!claimed_collateral[dyveID]) {
          (bool ok, ) = payable(listing.lender).call{value: listing.collateral}("");
          require(ok, "transfer of collateral from Dyve to lender failed!");

          claimed_collateral[dyveID] = true;
        }

        emit Close(listing.borrower, listing.lender, listing.dyveId, listing.NFTCollectionID, _replacementNFTID);

        nft_has_open_listing[_hashNFT(listing.NFTCollectionAddress, listing.NFTCollectionID)] = false;
  }

  /**
   * @notice Cancel an active listing (which has not been lent out yet!).
   * @param dyveID The Dyve ID of the listing to cancel.
   */
  function cancel(uint dyveID) external mustExist(dyveID) mustBeListed(dyveID){
    Listing storage listing = listings[dyveID];
    require(listing.lender == msg.sender, "Not authorized!");

    listings[dyveID].status = ListingStatus.CLOSED;

    // transfer the NFT back to the lender (will require approval)
    IERC721(listing.NFTCollectionAddress).safeTransferFrom(address(this), msg.sender, listing.NFTCollectionID);

    emit Cancel(listing.borrower, listing.lender, listing.dyveId, listing.NFTCollectionID);

    nft_has_open_listing[_hashNFT(listing.NFTCollectionAddress, listing.NFTCollectionID)] = false;
  }

  /**
   * @notice update a listing with a new fee.
   * @param dyveID the Dyve ID/listing to update.
   * @param _fee the new fee for the listing.
   */
  function update(uint dyveID, uint _fee) external mustExist(dyveID) mustBeListed(dyveID) {
    listings[dyveID].fee = _fee;

    emit Update(dyveID, _fee);
  }

  /**
   * @notice Claim collateral in the event of the listing expiring (the borrower being unresponsive, e.g.).
   * @param dyveID the Dyve ID of the listing to update.
   * @dev the listing must exist. Must not already be closed and expired
   */
  function claimCollateral(uint dyveID) external payable mustExist(dyveID) {
    Listing memory listing = listings[dyveID];

    if(
      !(listing.status == ListingStatus.LISTED) &&
      !(listing.status == ListingStatus.CLOSED) &&
      !(listing.status == ListingStatus.EXPIRED) &&
       (block.timestamp >= listing.expiryDateTime)
    )
    {
      // transfer the collateral from Dyve to the lender because the listing expired!
      listings[dyveID].status = ListingStatus.EXPIRED;

      require(address(this).balance >= listing.collateral, "Insufficient funds to transfer");

      if (!claimed_collateral[dyveID]) {
        (bool ok, ) = payable(listing.lender).call{value: listing.collateral}("");
        require(ok, "Transfer failed!");

        claimed_collateral[dyveID] = true;
      }

      emit Expired(listing.borrower, listing.lender, listing.dyveId);

      nft_has_open_listing[_hashNFT(listing.NFTCollectionAddress, listing.NFTCollectionID)] = false;
    }
  }

  /**
   * @notice Implemented to support the Safe Transfer mechanism.
   */
  function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
  }
}
