// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

// OZ libraries
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";

// Dyve Interfaces
import {IEscrow} from "./interfaces/IEscrow.sol";
import {IOrderManager} from "./interfaces/IOrderManager.sol";
import {INonceManager} from "./interfaces/INonceManager.sol";
import {OrderTypes} from "./libraries/OrderTypes.sol";
import {SignatureChecker} from "./libraries/SignatureChecker.sol";

/**
 * @notice The Dyve Contract to handle short Selling of NFTs.
 * @dev implements the IERC721Receiver so we can use the safeTransferFrom mechanism.
 */
contract DyveExchange is ReentrancyGuard, Ownable {
  using OrderTypes for OrderTypes.MakerOrder;
  using OrderTypes for OrderTypes.TakerOrder;

  IEscrow public escrow;
  IOrderManager public orderManager;
  INonceManager public nonceManager;
  
  bytes32 public immutable DOMAIN_SEPARATOR;
  address public protocolFeeRecipient;

  event TakerAsk(
    bytes32 orderHash, // ask hash of the maker order
    uint256 orderNonce, // user order nonce
    address indexed taker,
    address indexed maker,
    address collection,
    uint256 tokenId,
    uint256 collateral,
    uint256 fee,
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
    uint256 duration,
    uint256 expiryDateTime,
    ListingStatus status
  );

  constructor(
    address _escrow, 
    address _protocolFeeRecipient,
    address _orderManager,
    address _nonceManager
  ) {
    escrow = IEscrow(_escrow);
    orderManager = IOrderManager(_orderManager);
    nonceManager = INonceManager(_nonceManager);
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

    // Update maker ask order status to true (prevents replay)
    nonceManager.setExecutedUserOrderNonce(makerAsk.nonce);

    // Create order
    orderManager.createOrder(
      askHash,
      payable(makerAsk.signer),
      payable(takerBid.taker),
      makerAsk.collection,
      makerAsk.tokenId,
      block.timestamp + makerAsk.duration,
      makerAsk.collateral
    );

    _transferFeesAndFunds(makerAsk.signer, takerBid.fee, takerBid.collateral);

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
      nonceManager.setExecutedUserOrderNonce(makerBid.nonce);

      // Create order
      orderManager.createOrder(
        askHash,
        payable(makerAsk.signer),
        payable(takerBid.taker),
        makerAsk.collection,
        makerAsk.tokenId,
        block.timestamp + makerAsk.duration,
        makerAsk.collateral
      );

      IERC721(makerAsk.collection).safeTransferFrom(makerAsk.signer, takerBid.taker, makerAsk.tokenId);

      _transferFeesAndFunds(makerAsk.signer, takerBid.fee, takerBid.collateral);

      // _transferFeesAndFunds(
      //     makerBid.strategy,
      //     makerBid.collection,
      //     tokenId,
      //     makerBid.currency,
      //     makerBid.signer,
      //     takerAsk.taker,
      //     takerAsk.price,
      //     takerAsk.minPercentageToAsk
      // );

      emit TakerAsk(
      askHash,
      makerAsk.nonce,
      takerBid.taker,
      makerAsk.signer,
      makerAsk.collection,
      makerAsk.tokenId,
      takerBid.collateral,
      takerBid.fee,
      makerAsk.duration,
      orders[askHash].expiryDateTime,
      ListingStatus.BORROWED
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
      require(
        !nonceManager.isUserOrderNonceExecutedOrCancelled(makerOrder.nonce),
        "Order: Matching order listing expired"
      );

      // Verify the fee and collateral are not 0
      require(makerOrder.fee > 0, "Order: fee cannot be 0");
      require(makerOrder.collateral > 0, "Order: collateral cannot be 0");

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

  function updateOrderManager(address _orderManager) external onlyOwner {
    require(_orderManager != address(0), "Owner: Cannot be null address");
    orderManager = IOrderManager(_orderManager);
  }

  function updateNonceManager(address _nonceManager) external onlyOwner {
    require(_nonceManager != address(0), "Owner: Cannot be null address");
    nonceManager = INonceManager(_nonceManager);
  }
}
