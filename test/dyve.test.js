const { expect, use } = require("chai")
const { ethers } = require("hardhat")
const { setup, tokenSetup, generateSignature, computeOrderHash } = require("./helpers")
use(require('chai-as-promised'))

const { solidityKeccak256, keccak256, defaultAbiCoder } = ethers.utils;

function range(size, startAt = 0) {
  return [...Array(size).keys()].map(i => i + startAt);
}

let accounts;
let owner;
let addr1;
let addr2;
let addrs;
let protocolFeeRecipient;
let weth;
let mockUSDC;
let dyve;
let lender;

beforeEach(async function () {
  accounts = await ethers.getSigners(); 
  [owner, addr1, addr2, ...addrs] = accounts;
  protocolFeeRecipient = addr2;

  [lender, weth, mockUSDC, dyve] = await setup(protocolFeeRecipient)
  await tokenSetup([owner, addr1, addr2], weth, mockUSDC, lender, dyve)
});

describe("Dyve", function () {
  it("checks initial properties were set correctly", async () => {
    const DOMAIN_SEPARATOR = keccak256(defaultAbiCoder.encode(
      ["bytes32", "bytes32", "bytes32", "uint256", "address"],
      [
        solidityKeccak256(["string"], ["EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"]),
        solidityKeccak256(["string"], ["Dyve"]),
        solidityKeccak256(["string"], ["1"]),
        31337,
        dyve.address
      ]
    ))

    await expect(dyve.DOMAIN_SEPARATOR()).to.eventually.equal(DOMAIN_SEPARATOR)
    await expect(dyve.protocolFeeRecipient()).to.eventually.equal(protocolFeeRecipient.address)
    await expect(dyve.WETH()).to.eventually.equal(weth.address)
  })

  it("adds and removes USDC as a whitelisted currency", async () => {
    const addWhitelistTx = await dyve.addWhitelistedCurrency(mockUSDC.address) 
    await addWhitelistTx.wait()

    await expect(dyve.isCurrencyWhitelisted(mockUSDC.address)).to.be.eventually.true
    await expect(addWhitelistTx).to.emit(dyve, "addCurrencyWhitelist").withArgs(mockUSDC.address)

    const removeWhitelistTx = await dyve.removeWhitelistedCurrency(mockUSDC.address) 
    await removeWhitelistTx.wait()

    await expect(dyve.isCurrencyWhitelisted(mockUSDC.address)).to.be.eventually.false
    await expect(removeWhitelistTx).to.emit(dyve, "removeCurrencyWhitelist").withArgs(mockUSDC.address)
  })

  it("consumes maker ask (listing) with taker bid using ETH", async () => {
    const data = {
      orderType: 0,
      signer: owner.address,
      collection: lender.address,
      tokenId: 1,
      duration: 10800,
      collateral: ethers.utils.parseEther("1").toString(),
      fee: ethers.utils.parseEther("0.1").toString(),
      currency: ethers.constants.AddressZero,
      nonce: 100,
      startTime: Math.floor(Date.now() / 1000),
      endTime: Math.floor(Date.now() / 1000) + 86400,
    }

    const signature = await generateSignature(data, owner, dyve)
    const makerOrder = { ...data, ...signature }

    const borrowTx = await dyve.connect(addr1).fulfillOrder(makerOrder, { value: ethers.utils.parseEther("1.1").toString() })
    await borrowTx.wait()

    const makerOrderHash = computeOrderHash(data)
    const order = await dyve.orders(makerOrderHash)

    const { timestamp } = await ethers.provider.getBlock(borrowTx.blockNumber)

    expect(lender.ownerOf(1)).to.eventually.equal(addr1.address);
    await expect(() => borrowTx).to.changeEtherBalance(dyve, ethers.utils.parseEther("1"));
    await expect(() => borrowTx).to.changeEtherBalance(owner, ethers.utils.parseEther(String(0.1 * 0.98)));
    await expect(() => borrowTx).to.changeEtherBalance(protocolFeeRecipient, ethers.utils.parseEther(String(0.1 * 0.02)));
    await expect(() => borrowTx).to.changeEtherBalance(addr1, ethers.utils.parseEther("-1.1"));

    expect(order.orderHash).to.equal(order.orderHash);
    expect(order.lender).to.equal(data.signer);
    expect(order.borrower).to.equal(addr1.address);
    expect(order.collection).to.equal(data.collection);
    expect(order.tokenId).to.equal(data.tokenId);
    expect(order.expiryDateTime).to.equal(timestamp + data.duration);
    expect(order.collateral).to.equal(data.collateral);
    expect(order.currency).to.equal(ethers.constants.AddressZero);
    expect(order.status).to.equal(0);

    await expect(borrowTx)
    .to.emit(dyve, "OrderFulfilled")
    .withArgs(
      order.orderHash,
      order.orderType,
      data.nonce,
      order.borrower,
      order.lender,
      order.collection,
      order.tokenId,
      order.collateral,
      data.fee,
      order.currency,
      data.duration,
      order.expiryDateTime,
      order.status,
    )

    await expect(dyve.connect(addr1).fulfillOrder(makerOrder, { value: ethers.utils.parseEther("1.1") }))
      .to.be.rejectedWith("Order: Matching order listing expired")
  })

  it("consumes maker ask (listing) with taker bid using USDC", async () => {
    const data = {
      orderType: 2,
      signer: owner.address,
      collection: lender.address,
      tokenId: 1,
      duration: 10800,
      collateral: ethers.utils.parseEther("1").toString(),
      fee: ethers.utils.parseEther("0.1").toString(),
      currency: mockUSDC.address,
      nonce: 100,
      startTime: Math.floor(Date.now() / 1000),
      endTime: Math.floor(Date.now() / 1000) + 86400,
    }

    const signature = await generateSignature(data, owner, dyve)
    const makerOrder = { ...data, ...signature }

    const addCurrencyTx = await dyve.addWhitelistedCurrency(mockUSDC.address)
    await addCurrencyTx.wait()

    const borrowTx = await dyve.connect(addr1).fulfillOrder(makerOrder)
    await borrowTx.wait()

    const makerOrderHash = computeOrderHash(data)
    const order = await dyve.orders(makerOrderHash)

    const { timestamp } = await ethers.provider.getBlock(borrowTx.blockNumber)

    expect(lender.ownerOf(1)).to.eventually.equal(addr1.address);
    await expect(mockUSDC.balanceOf(dyve.address)).to.eventually.equal(ethers.utils.parseEther("1"));
    await expect(mockUSDC.balanceOf(owner.address)).to.eventually.equal(ethers.utils.parseEther(String(30 + (0.1 * 0.98))));
    await expect(mockUSDC.balanceOf(addr1.address)).to.eventually.equal(ethers.utils.parseEther(String(30 - 1.1)));
    await expect(mockUSDC.balanceOf(protocolFeeRecipient.address)).to.eventually.equal(ethers.utils.parseEther(String(30 + (0.1 * 0.02))));

    expect(order.orderHash).to.equal(order.orderHash);
    expect(order.lender).to.equal(data.signer);
    expect(order.borrower).to.equal(addr1.address);
    expect(order.collection).to.equal(data.collection);
    expect(order.tokenId).to.equal(data.tokenId);
    expect(order.expiryDateTime).to.equal(timestamp + data.duration);
    expect(order.collateral).to.equal(data.collateral);
    expect(order.currency).to.equal(mockUSDC.address);
    expect(order.status).to.equal(0);

    await expect(borrowTx)
    .to.emit(dyve, "OrderFulfilled")
    .withArgs(
      order.orderHash,
      order.orderType,
      data.nonce,
      order.borrower,
      order.lender,
      order.collection,
      order.tokenId,
      order.collateral,
      data.fee,
      order.currency,
      data.duration,
      order.expiryDateTime,
      order.status,
    )

    await expect(dyve.connect(addr1).fulfillOrder(makerOrder))
      .to.be.rejectedWith("Order: Matching order listing expired")
  })


  it("consumes maker bid (offer) with taker ask using USDC", async () => {
    const data = {
      orderType: 4,
      signer: addr1.address,
      collection: lender.address,
      tokenId: 1,
      duration: 10800,
      collateral: ethers.utils.parseEther("1").toString(),
      fee: ethers.utils.parseEther("0.1").toString(),
      currency: mockUSDC.address,
      nonce: 100,
      startTime: Math.floor(Date.now() / 1000),
      endTime: Math.floor(Date.now() / 1000) + 86400,
    }

    const signature = await generateSignature(data, addr1, dyve)
    const makerOrder = { ...data, ...signature }

    const addCurrencyTx = await dyve.addWhitelistedCurrency(mockUSDC.address)
    await addCurrencyTx.wait()

    const borrowTx = await dyve.fulfillOrder(makerOrder)
    await borrowTx.wait()

    const makerOrderHash = computeOrderHash(data)
    const order = await dyve.orders(makerOrderHash)

    const { timestamp } = await ethers.provider.getBlock(borrowTx.blockNumber)

    expect(lender.ownerOf(1)).to.eventually.equal(addr1.address);
    await expect(mockUSDC.balanceOf(dyve.address)).to.eventually.equal(ethers.utils.parseEther("1"));
    await expect(mockUSDC.balanceOf(owner.address)).to.eventually.equal(ethers.utils.parseEther(String(30 + (0.1 * 0.98))));
    await expect(mockUSDC.balanceOf(addr1.address)).to.eventually.equal(ethers.utils.parseEther(String(30 - 1.1)));
    await expect(mockUSDC.balanceOf(protocolFeeRecipient.address)).to.eventually.equal(ethers.utils.parseEther(String(30 + (0.1 * 0.02))));

    expect(order.orderHash).to.equal(order.orderHash);
    expect(order.lender).to.equal(owner.address);
    expect(order.borrower).to.equal(makerOrder.signer);
    expect(order.collection).to.equal(data.collection);
    expect(order.tokenId).to.equal(data.tokenId);
    expect(order.expiryDateTime).to.equal(timestamp + data.duration);
    expect(order.collateral).to.equal(data.collateral);
    expect(order.currency).to.equal(mockUSDC.address);
    expect(order.status).to.equal(0);

    await expect(borrowTx)
    .to.emit(dyve, "OrderFulfilled")
    .withArgs(
      order.orderHash,
      order.orderType,
      data.nonce,
      order.lender,
      order.borrower,
      order.collection,
      order.tokenId,
      order.collateral,
      data.fee,
      order.currency,
      data.duration,
      order.expiryDateTime,
      order.status,
    )

    await expect(dyve.fulfillOrder(makerOrder))
      .to.be.rejectedWith("Order: Matching order listing expired")
  })

  
  it("checks validation for fulfillOrder", async () => {
    const data = {
      orderType: 0,
      signer: owner.address,
      collection: lender.address,
      tokenId: 1,
      duration: 10800,
      collateral: ethers.utils.parseEther("1").toString(),
      fee: ethers.utils.parseEther("0.1").toString(),
      currency: ethers.constants.AddressZero,
      nonce: 100,
      startTime: Math.floor(Date.now() / 1000),
      endTime: Math.floor(Date.now() / 1000) + 86400,
    }

    const signature = await generateSignature(data, owner, dyve)
    const makerOrder = { ...data, ...signature }

    const totalAmount = ethers.utils.parseEther("1.1");

    // Incorrect amount of ETH sent
    const reducedAmount = totalAmount.sub(1);
    await expect(dyve.connect(addr1).fulfillOrder(makerOrder, { value: reducedAmount }))
      .to.be.rejectedWith("Order: Incorrect amount of ETH sent")

    // ETH sent to an ERC20 based transaction
    const ERC20Order = { ...makerOrder, currency: weth.address, orderType: 2 }
    await expect(dyve.connect(addr1).fulfillOrder(ERC20Order, { value: totalAmount }))
      .to.be.rejectedWith("Order: ETH sent for an ERC20 type transaction")

    // Signer is the zero address
    const zeroAddressMaker = { ...makerOrder, signer: ethers.constants.AddressZero }
    await expect(dyve.connect(addr1).fulfillOrder(zeroAddressMaker, { value: totalAmount }))
      .to.be.rejectedWith("Order: Invalid signer")

    // fee is zero
    const feeZeroMaker = { ...makerOrder, fee: ethers.utils.parseEther("0").toString() }
    await expect(dyve.connect(addr1).fulfillOrder(feeZeroMaker, { value: ethers.utils.parseEther("1") }))
      .to.be.rejectedWith("Order: fee cannot be 0")

    // collateral is zero
    const collateralZeroMaker = { ...makerOrder, collateral: ethers.utils.parseEther("0").toString() }
    await expect(dyve.connect(addr1).fulfillOrder(collateralZeroMaker, { value: ethers.utils.parseEther("0.1") }))
      .to.be.rejectedWith("Order: collateral cannot be 0")

    // invalid v parameter
    const invalidVSignatureMaker = { ...makerOrder, v: 1 }
    await expect(dyve.connect(addr1).fulfillOrder(invalidVSignatureMaker, { value: totalAmount }))
      .to.be.rejectedWith("Signature: Invalid v parameter")

    // invalid signature signer
    const invalidSignerMaker = { ...makerOrder, s: ethers.constants.HashZero }
    await expect(dyve.connect(addr1).fulfillOrder(invalidSignerMaker, { value: totalAmount }))
      .to.be.rejectedWith("Signature: Invalid signer")

    // invalid signature
    const invalidSignatureMaker = { ...makerOrder, s: ethers.utils.hexlify(ethers.utils.randomBytes(32)) }
    await expect(dyve.connect(addr1).fulfillOrder(invalidSignatureMaker, { value: totalAmount }))
      .to.be.rejectedWith("Signature: Invalid")
  })

  it("consumes Maker Bid (with ETH) Listing then closes the position", async () => {
    const data = {
      orderType: 0,
      signer: owner.address,
      collection: lender.address,
      tokenId: 1,
      duration: 10800,
      collateral: ethers.utils.parseEther("1").toString(),
      fee: ethers.utils.parseEther("0.1").toString(),
      currency: ethers.constants.AddressZero,
      nonce: 100,
      startTime: Math.floor(Date.now() / 1000),
      endTime: Math.floor(Date.now() / 1000) + 86400,
    }

    const signature = await generateSignature(data, owner, dyve)
    const makerOrder = { ...data, ...signature }

    const totalAmount = ethers.utils.parseEther("1.1").toString();
    const borrowTx = await dyve.connect(addr1).fulfillOrder(makerOrder, { value: totalAmount })
    await borrowTx.wait();

    const makerOrderHash = computeOrderHash(data);
    const closeTx = await dyve.connect(addr1).closePosition(makerOrderHash, data.tokenId);
    await closeTx.wait();

    const order = await dyve.orders(makerOrderHash)

    await expect(() => closeTx).to.changeEtherBalance(dyve, ethers.utils.parseEther("-1"));
    await expect(() => closeTx).to.changeEtherBalance(addr1, ethers.utils.parseEther("1"));

    expect(lender.ownerOf(1)).to.eventually.equal(owner.address);
    expect(order.status).to.equal(2);

    await expect(closeTx)
    .to.emit(dyve, "Close")
    .withArgs(
      order.orderHash,
      order.orderType,
      order.borrower,
      order.lender,
      order.collection,
      order.tokenId,
      1,
      order.collateral,
      order.currency,
      order.status,
    )
  })

  it("consumes Maker Bid (with USDC) Listing then closes the position", async () => {
    const data = {
      orderType: 2,
      signer: owner.address,
      collection: lender.address,
      tokenId: 1,
      duration: 10800,
      collateral: ethers.utils.parseEther("1").toString(),
      fee: ethers.utils.parseEther("0.1").toString(),
      currency: mockUSDC.address,
      nonce: 100,
      startTime: Math.floor(Date.now() / 1000),
      endTime: Math.floor(Date.now() / 1000) + 86400,
    }

    const signature = await generateSignature(data, owner, dyve)
    const makerOrder = { ...data, ...signature }

    const whitelistTx = await dyve.addWhitelistedCurrency(mockUSDC.address)
    await whitelistTx.wait();

    const borrowTx = await dyve.connect(addr1).fulfillOrder(makerOrder)
    await borrowTx.wait();

    const makerOrderHash = computeOrderHash(data);
    const closeTx = await dyve.connect(addr1).closePosition(makerOrderHash, data.tokenId);
    await closeTx.wait();

    const order = await dyve.orders(makerOrderHash)

    await expect(mockUSDC.balanceOf(dyve.address)).to.eventually.eq(ethers.utils.parseEther("0"));
    await expect(mockUSDC.balanceOf(addr1.address)).to.eventually.eq(ethers.utils.parseEther(String(30 - 0.1)));

    expect(lender.ownerOf(1)).to.eventually.equal(owner.address);
    expect(order.status).to.equal(2);

    await expect(closeTx)
    .to.emit(dyve, "Close")
    .withArgs(
      order.orderHash,
      order.orderType,
      order.borrower,
      order.lender,
      order.collection,
      order.tokenId,
      1,
      order.collateral,
      order.currency,
      order.status,
    )
  })

  it("checks validation for closePosition", async () => {
    const data = {
      orderType: 0,
      signer: owner.address,
      collection: lender.address,
      tokenId: 1,
      duration: 10800,
      collateral: ethers.utils.parseEther("1").toString(),
      fee: ethers.utils.parseEther("0.1").toString(),
      currency: ethers.constants.AddressZero,
      nonce: 100,
      startTime: Math.floor(Date.now() / 1000),
      endTime: Math.floor(Date.now() / 1000) + 86400,
    }

    const signature = await generateSignature(data, owner, dyve)
    const makerOrder = { ...data, ...signature }

    const totalAmount = ethers.utils.parseEther("1.1").toString();
    const borrowTx = await dyve.connect(addr1).fulfillOrder(makerOrder, { value: totalAmount })
    await borrowTx.wait();

    const makerOrderHash = computeOrderHash(data);

    // Borrower is not msg.sender
    await expect(dyve.closePosition(makerOrderHash, data.tokenId))
      .to.be.rejectedWith("Order: Borrower must be the sender")

    const closeTx = await dyve.connect(addr1).closePosition(makerOrderHash, data.tokenId);
    await closeTx.wait();

    // Borrower does not own the ERC721
    await expect(dyve.connect(addr1).closePosition(makerOrderHash, data.tokenId))
      .to.be.rejectedWith("Order: Borrower does not own the returning ERC721 token")

    // Order is not active
    const transferTx = await lender.transferFrom(owner.address, addr1.address, 1);
    await transferTx.wait()
    await expect(dyve.connect(addr1).closePosition(makerOrderHash, data.tokenId))
      .to.be.rejectedWith("Order: Order is not borrowed")
  })

  it("consumes Maker Bid Listing (using ETH) then the lender claims the collateral", async () => {
    const data = {
      orderType: 0,
      signer: owner.address,
      collection: lender.address,
      tokenId: 1,
      duration: 10800,
      collateral: ethers.utils.parseEther("1").toString(),
      fee: ethers.utils.parseEther("0.1").toString(),
      currency: ethers.constants.AddressZero,
      nonce: 100,
      startTime: Math.floor(Date.now() / 1000),
      endTime: Math.floor(Date.now() / 1000) + 86400,
    }

    const signature = await generateSignature(data, owner, dyve)
    const makerOrder = { ...data, ...signature }

    const borrowTx = await dyve.connect(addr1).fulfillOrder(makerOrder, { value: ethers.utils.parseEther("1.1") })
    await borrowTx.wait();

    const { timestamp } = await ethers.provider.getBlock(borrowTx.blockNumber)
    await ethers.provider.send("evm_mine", [timestamp + 10800]);

    const makerOrderHash = computeOrderHash(data);
    const claimTx = await dyve.claimCollateral(makerOrderHash);
    await claimTx.wait();

    const order = await dyve.orders(makerOrderHash);

    await expect(() => claimTx).to.changeEtherBalance(owner, ethers.utils.parseEther("1"));
    await expect(() => claimTx).to.changeEtherBalance(dyve, ethers.utils.parseEther("-1"));
    expect(order.status).to.equal(1);

    await expect(claimTx)
    .to.emit(dyve, "Claim")
    .withArgs(
      order.orderHash,
      order.orderType,
      order.borrower,
      order.lender,
      order.collection,
      order.tokenId,
      order.collateral,
      order.currency,
      order.status,
    )
  })

  it("consumes Maker Bid Listing (using USDC) then the lender claims the collateral", async () => {
    const data = {
      orderType: 2,
      signer: owner.address,
      collection: lender.address,
      tokenId: 1,
      duration: 10800,
      collateral: ethers.utils.parseEther("1").toString(),
      fee: ethers.utils.parseEther("0.1").toString(),
      currency: mockUSDC.address,
      nonce: 100,
      startTime: Math.floor(Date.now() / 1000),
      endTime: Math.floor(Date.now() / 1000) + 86400,
    }

    const signature = await generateSignature(data, owner, dyve)
    const makerOrder = { ...data, ...signature }

    const whitelistTx = await dyve.addWhitelistedCurrency(mockUSDC.address)
    await whitelistTx.wait()

    const borrowTx = await dyve.connect(addr1).fulfillOrder(makerOrder)
    await borrowTx.wait();

    const { timestamp } = await ethers.provider.getBlock(borrowTx.blockNumber)
    await ethers.provider.send("evm_mine", [timestamp + 10800]);

    const makerOrderHash = computeOrderHash(data);
    const claimTx = await dyve.claimCollateral(makerOrderHash);
    await claimTx.wait();

    const order = await dyve.orders(makerOrderHash);

    // 30 ETH + 1 ETH - (0.1 * 0.98) ETH
    // 30 = originally balance
    // 1 = collateral
    // (0.1 * 0.98) = final lender fee after protocol fee cut
    await expect(mockUSDC.balanceOf(owner.address)).to.eventually.equal(ethers.utils.parseEther(String(30 + (0.1 * 0.98) + 1)))
    await expect(mockUSDC.balanceOf(dyve.address)).to.eventually.equal(ethers.utils.parseEther("0"))
    expect(order.status).to.equal(1);

    await expect(claimTx)
    .to.emit(dyve, "Claim")
    .withArgs(
      order.orderHash,
      order.orderType,
      order.borrower,
      order.lender,
      order.collection,
      order.tokenId,
      order.collateral,
      order.currency,
      order.status,
    )
  })


  it("checks validation for claimCollateral", async () => {
    const data = {
      orderType: 0,
      signer: owner.address,
      collection: lender.address,
      tokenId: 1,
      duration: 10800,
      collateral: ethers.utils.parseEther("1").toString(),
      fee: ethers.utils.parseEther("0.1").toString(),
      currency: ethers.constants.AddressZero,
      nonce: 100,
      startTime: Math.floor(Date.now() / 1000),
      endTime: Math.floor(Date.now() / 1000) + 86400,
    }

    const signature = await generateSignature(data, owner, dyve)
    const makerOrder = { ...data, ...signature }

    const totalAmount = ethers.utils.parseEther("1.1").toString();
    const borrowTx = await dyve.connect(addr1).fulfillOrder(makerOrder, { value: totalAmount })
    await borrowTx.wait();

    const makerOrderHash = computeOrderHash(data);

    // lender is not msg.sender
    await expect(dyve.connect(addr1).claimCollateral(makerOrderHash))   
      .to.be.rejectedWith("Order: Lender must be the sender")
    
    // Order is not expired
    await expect(dyve.claimCollateral(makerOrderHash))   
      .to.be.rejectedWith("Order: Order is not expired")

    // Order is not borrowed
    const { timestamp } = await ethers.provider.getBlock(borrowTx.blockNumber)
    await ethers.provider.send("evm_mine", [timestamp + 10800]);
    const claimTx = await dyve.claimCollateral(makerOrderHash)
    await claimTx.wait()

    await expect(dyve.claimCollateral(makerOrderHash))   
      .to.be.rejectedWith("Order: Order is not borrowed")
 })


  it("cancels all orders for user then fails to list order with old nonce", async () => {
    const cancelTx = await dyve.cancelAllOrdersForSender(120);
    await cancelTx.wait()

    const data = {
      orderType: 0,
      signer: owner.address,
      collection: lender.address,
      tokenId: 1,
      duration: 10800,
      collateral: ethers.utils.parseEther("1").toString(),
      fee: ethers.utils.parseEther("0.1").toString(),
      currency: ethers.constants.AddressZero,
      nonce: 100,
      startTime: Math.floor(Date.now() / 1000),
      endTime: Math.floor(Date.now() / 1000) + 86400,
    }

    const signature = await generateSignature(data, owner, dyve)
    const makerOrder = { ...data, ...signature }

    const totalAmount = ethers.utils.parseEther("1.1").toString();
    await expect(dyve.connect(addr1).fulfillOrder(makerOrder, { value: totalAmount }))
      .to.be.rejectedWith("Order: Matching order listing expired")

    await expect(cancelTx)
    .to.emit(dyve, "CancelAllOrders")
    .withArgs(owner.address, 120)
  })

  it("checks validation for cancelAllOrdersForSender", async () => {
    const cancelTx = await dyve.cancelAllOrdersForSender(120);
    await cancelTx.wait()

    await expect(dyve.cancelAllOrdersForSender(100))
      .to.be.rejectedWith("Cancel: Order nonce lower than current")
    await expect(dyve.cancelAllOrdersForSender(500121))
      .to.be.rejectedWith("Cancel: Cannot cancel more orders")
  })


  it("cancels an order and then fails to list the same order", async () => {
    const cancelTx = await dyve.cancelMultipleMakerOrders([100]);
    await cancelTx.wait()

    const data = {
      orderType: 0,
      signer: owner.address,
      collection: lender.address,
      tokenId: 1,
      duration: 10800,
      collateral: ethers.utils.parseEther("1").toString(),
      fee: ethers.utils.parseEther("0.1").toString(),
      currency: ethers.constants.AddressZero,
      nonce: 100,
      startTime: Math.floor(Date.now() / 1000),
      endTime: Math.floor(Date.now() / 1000) + 86400,
    }

    const signature = await generateSignature(data, owner, dyve)
    const makerOrder = { ...data, ...signature }

    const totalAmount = ethers.utils.parseEther("1.1").toString();
    await expect(dyve.connect(addr1).fulfillOrder(makerOrder, { value: totalAmount }))
      .to.be.rejectedWith("Order: Matching order listing expired")

    await expect(cancelTx)
    .to.emit(dyve, "CancelMultipleOrders")
    .withArgs(owner.address, [100])
  })

  it("checks validation for cancelMultipleMakerOrders", async () => {
    const cancelTx = await dyve.cancelAllOrdersForSender(120);
    await cancelTx.wait()

    await expect(dyve.cancelMultipleMakerOrders([]))
      .to.be.rejectedWith("Cancel: Cannot be empty")
    await expect(dyve.cancelMultipleMakerOrders([100]))
      .to.be.rejectedWith("Cancel: Order nonce lower than current")
  })
})
