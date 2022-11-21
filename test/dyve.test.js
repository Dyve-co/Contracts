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

  it("consumes maker ask (listing) with taker bid using ETH and WETH", async () => {
    const data = {
      isOrderAsk: true,
      signer: owner.address,
      collection: lender.address,
      tokenId: 1,
      duration: 10800,
      collateral: ethers.utils.parseEther("1").toString(),
      fee: ethers.utils.parseEther("0.1").toString(),
      currency: weth.address,
      nonce: 100,
      startTime: Math.floor(Date.now() / 1000),
      endTime: Math.floor(Date.now() / 1000) + 86400,
    }

    const signature = await generateSignature(data, owner, dyve)
    const makerOrder = { ...data, ...signature }
    const takerOrder = {
      isOrderAsk: false,
      taker: addr1.address,
      collateral: makerOrder.collateral,
      fee: makerOrder.fee,
      tokenId: makerOrder.tokenId,
    }

    const borrowTx = await dyve.connect(addr1).matchAskWithTakerBidUsingETHAndWETH(takerOrder, makerOrder, { value: ethers.utils.parseEther("1.1").toString() })
    await borrowTx.wait()

    const makerOrderHash = computeOrderHash(data)
    const order = await dyve.orders(makerOrderHash)

    const { timestamp } = await ethers.provider.getBlock(borrowTx.blockNumber)

    expect(lender.ownerOf(1)).to.eventually.equal(addr1.address);
    await expect(weth.balanceOf(dyve.address)).to.eventually.equal(ethers.utils.parseEther("1"));
    await expect(weth.balanceOf(owner.address)).to.eventually.equal(ethers.utils.parseEther(String(30 + (0.1 * 0.98))));
    await expect(weth.balanceOf(protocolFeeRecipient.address)).to.eventually.equal(ethers.utils.parseEther(String(30 + (0.1 * 0.02))));
    await expect(() => borrowTx).to.changeEtherBalance(addr1, ethers.utils.parseEther("-1.1"));

    expect(order.orderHash).to.equal(order.orderHash);
    expect(order.lender).to.equal(data.signer);
    expect(order.borrower).to.equal(takerOrder.taker);
    expect(order.collection).to.equal(data.collection);
    expect(order.tokenId).to.equal(data.tokenId);
    expect(order.expiryDateTime).to.equal(timestamp + data.duration);
    expect(order.collateral).to.equal(data.collateral);
    expect(order.currency).to.equal(weth.address);
    expect(order.status).to.equal(0);

    await expect(borrowTx)
    .to.emit(dyve, "TakerBid")
    .withArgs(
      order.orderHash,
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

    await expect(dyve.connect(addr1).matchAskWithTakerBid(takerOrder, makerOrder, { value: ethers.utils.parseEther("1.1") }))
      .to.be.rejectedWith("Order: Matching order listing expired")
  })

  it("consumes maker ask (listing) with taker bid using ETH and WETH", async () => {
    const data = {
      isOrderAsk: true,
      signer: owner.address,
      collection: lender.address,
      tokenId: 1,
      duration: 10800,
      collateral: ethers.utils.parseEther("1").toString(),
      fee: ethers.utils.parseEther("0.1").toString(),
      currency: weth.address,
      nonce: 100,
      startTime: Math.floor(Date.now() / 1000),
      endTime: Math.floor(Date.now() / 1000) + 86400,
    }

    const signature = await generateSignature(data, owner, dyve)
    const makerOrder = { ...data, ...signature }
    const takerOrder = {
      isOrderAsk: false,
      taker: addr1.address,
      collateral: makerOrder.collateral,
      fee: makerOrder.fee,
      tokenId: makerOrder.tokenId,
    }

    const borrowTx = await dyve.connect(addr1).matchAskWithTakerBidUsingETHAndWETH(takerOrder, makerOrder, { value: ethers.utils.parseEther("0.1").toString() })
    await borrowTx.wait()

    const makerOrderHash = computeOrderHash(data)
    const order = await dyve.orders(makerOrderHash)

    const { timestamp } = await ethers.provider.getBlock(borrowTx.blockNumber)

    expect(lender.ownerOf(1)).to.eventually.equal(addr1.address);
    await expect(weth.balanceOf(dyve.address)).to.eventually.equal(ethers.utils.parseEther("1"));
    await expect(weth.balanceOf(owner.address)).to.eventually.equal(ethers.utils.parseEther(String(30 + (0.1 * 0.98))));
    await expect(weth.balanceOf(protocolFeeRecipient.address)).to.eventually.equal(ethers.utils.parseEther(String(30 + (0.1 * 0.02))));
    await expect(weth.balanceOf(addr1.address)).to.eventually.equal(ethers.utils.parseEther(String(30 - 1)));
    await expect(() => borrowTx).to.changeEtherBalance(addr1, ethers.utils.parseEther("-0.1"));

    expect(order.orderHash).to.equal(order.orderHash);
    expect(order.lender).to.equal(data.signer);
    expect(order.borrower).to.equal(takerOrder.taker);
    expect(order.collection).to.equal(data.collection);
    expect(order.tokenId).to.equal(data.tokenId);
    expect(order.expiryDateTime).to.equal(timestamp + data.duration);
    expect(order.collateral).to.equal(data.collateral);
    expect(order.currency).to.equal(weth.address);
    expect(order.status).to.equal(0);

    await expect(borrowTx)
    .to.emit(dyve, "TakerBid")
    .withArgs(
      order.orderHash,
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

    await expect(dyve.connect(addr1).matchAskWithTakerBid(takerOrder, makerOrder, { value: ethers.utils.parseEther("1.1") }))
      .to.be.rejectedWith("Order: Matching order listing expired")
  })


  it("consumes maker ask (listing) with taker bid using USDC", async () => {
    const data = {
      isOrderAsk: true,
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
    const takerOrder = {
      isOrderAsk: false,
      taker: addr1.address,
      collateral: makerOrder.collateral,
      fee: makerOrder.fee,
      tokenId: makerOrder.tokenId,
    }

    const addCurrencyTx = await dyve.addWhitelistedCurrency(mockUSDC.address)
    await addCurrencyTx.wait()

    const borrowTx = await dyve.connect(addr1).matchAskWithTakerBid(takerOrder, makerOrder)
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
    expect(order.borrower).to.equal(takerOrder.taker);
    expect(order.collection).to.equal(data.collection);
    expect(order.tokenId).to.equal(data.tokenId);
    expect(order.expiryDateTime).to.equal(timestamp + data.duration);
    expect(order.collateral).to.equal(data.collateral);
    expect(order.currency).to.equal(mockUSDC.address);
    expect(order.status).to.equal(0);

    await expect(borrowTx)
    .to.emit(dyve, "TakerBid")
    .withArgs(
      order.orderHash,
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

    await expect(dyve.connect(addr1).matchAskWithTakerBid(takerOrder, makerOrder, { value: ethers.utils.parseEther("1.1") }))
      .to.be.rejectedWith("Order: Matching order listing expired")
  })

  
  it("checks validation for matchAskWithTakerBidUsingETHAndWETH", async () => {
    const data = {
      isOrderAsk: true,
      signer: owner.address,
      collection: lender.address,
      tokenId: 1,
      duration: 10800,
      collateral: ethers.utils.parseEther("1").toString(),
      fee: ethers.utils.parseEther("0.1").toString(),
      currency: weth.address,
      nonce: 100,
      startTime: Math.floor(Date.now() / 1000),
      endTime: Math.floor(Date.now() / 1000) + 86400,
    }

    const signature = await generateSignature(data, owner, dyve)
    const makerOrder = { ...data, ...signature }
    const takerOrder = {
      isOrderAsk: false,
      taker: addr1.address,
      collateral: makerOrder.collateral,
      fee: makerOrder.fee,
      tokenId: makerOrder.tokenId,
    }

    const totalAmount = ethers.utils.parseEther("1.1");

    // wrong sides of maker and taker
    const wrongMaker = { ...makerOrder, isOrderAsk: false }
    const wrongTaker = { ...takerOrder, isOrderAsk: true }
    await expect(dyve.connect(addr1).matchAskWithTakerBidUsingETHAndWETH(wrongTaker, makerOrder, { value: totalAmount }))
      .to.be.rejectedWith("Order: Wrong sides")
    await expect(dyve.connect(addr1).matchAskWithTakerBidUsingETHAndWETH(takerOrder, wrongMaker, { value: totalAmount }))
      .to.be.rejectedWith("Order: Wrong sides")
    await expect(dyve.connect(addr1).matchAskWithTakerBidUsingETHAndWETH(wrongTaker, wrongMaker, { value: totalAmount }))
      .to.be.rejectedWith("Order: Wrong sides")

    // Sender is not the taker
    await expect(dyve.matchAskWithTakerBidUsingETHAndWETH(takerOrder, makerOrder, { value: totalAmount }))
      .to.be.rejectedWith("Order: Taker must be the sender")

    // sending in too much ETH
    const surplusAmount = ethers.utils.parseEther("2")
    await expect(dyve.connect(addr1).matchAskWithTakerBidUsingETHAndWETH(takerOrder, makerOrder, { value: surplusAmount }))
      .to.be.rejectedWith("Order: Msg.value too high")

    // Signer is the zero address
    const zeroAddressMaker = { ...makerOrder, signer: ethers.constants.AddressZero }
    await expect(dyve.connect(addr1).matchAskWithTakerBidUsingETHAndWETH(takerOrder, zeroAddressMaker, { value: totalAmount }))
      .to.be.rejectedWith("Order: Invalid signer")

    // fee is zero
    const feeZeroMaker = { ...makerOrder, fee: ethers.utils.parseEther("0").toString() }
    await expect(dyve.connect(addr1).matchAskWithTakerBidUsingETHAndWETH(takerOrder, feeZeroMaker, { value: totalAmount }))
      .to.be.rejectedWith("Order: fee cannot be 0")

    // collateral is zero
    const collateralZeroMaker = { ...makerOrder, collateral: ethers.utils.parseEther("0").toString() }
    await expect(dyve.connect(addr1).matchAskWithTakerBidUsingETHAndWETH(takerOrder, collateralZeroMaker, { value: totalAmount }))
      .to.be.rejectedWith("Order: collateral cannot be 0")

    // currency is not WETH
    const currencyNotWETHMaker = { ...makerOrder, currency: mockUSDC.address }
    await expect(dyve.connect(addr1).matchAskWithTakerBidUsingETHAndWETH(takerOrder, currencyNotWETHMaker, { value: totalAmount }))
      .to.be.rejectedWith("Order: Currency must be WETH")

    // invalid v parameter
    const invalidVSignatureMaker = { ...makerOrder, v: 1 }
    await expect(dyve.connect(addr1).matchAskWithTakerBidUsingETHAndWETH(takerOrder, invalidVSignatureMaker, { value: totalAmount }))
      .to.be.rejectedWith("Signature: Invalid v parameter")

    // invalid signature signer
    const invalidSignerMaker = { ...makerOrder, s: ethers.constants.HashZero }
    await expect(dyve.connect(addr1).matchAskWithTakerBidUsingETHAndWETH(takerOrder, invalidSignerMaker, { value: totalAmount }))
      .to.be.rejectedWith("Signature: Invalid signer")

    // invalid signature
    const invalidSignatureMaker = { ...makerOrder, s: ethers.utils.hexlify(ethers.utils.randomBytes(32)) }
    await expect(dyve.connect(addr1).matchAskWithTakerBidUsingETHAndWETH(takerOrder, invalidSignatureMaker, { value: totalAmount }))
      .to.be.rejectedWith("Signature: Invalid")
  })

  it("checks validation for matchAskWithTakerBid", async () => {
    const data = {
      isOrderAsk: true,
      signer: owner.address,
      collection: lender.address,
      tokenId: 1,
      duration: 10800,
      collateral: ethers.utils.parseEther("1").toString(),
      fee: ethers.utils.parseEther("0.1").toString(),
      currency: weth.address,
      nonce: 100,
      startTime: Math.floor(Date.now() / 1000),
      endTime: Math.floor(Date.now() / 1000) + 86400,
    }

    const signature = await generateSignature(data, owner, dyve)
    const makerOrder = { ...data, ...signature }
    const takerOrder = {
      isOrderAsk: false,
      taker: addr1.address,
      collateral: makerOrder.collateral,
      fee: makerOrder.fee,
      tokenId: makerOrder.tokenId,
    }

    const totalAmount = ethers.utils.parseEther("1.1");

    // wrong sides of maker and taker
    const wrongMaker = { ...makerOrder, isOrderAsk: false }
    const wrongTaker = { ...takerOrder, isOrderAsk: true }
    await expect(dyve.connect(addr1).matchAskWithTakerBid(wrongTaker, makerOrder, { value: totalAmount }))
      .to.be.rejectedWith("Order: Wrong sides")
    await expect(dyve.connect(addr1).matchAskWithTakerBid(takerOrder, wrongMaker, { value: totalAmount }))
      .to.be.rejectedWith("Order: Wrong sides")
    await expect(dyve.connect(addr1).matchAskWithTakerBid(wrongTaker, wrongMaker, { value: totalAmount }))
      .to.be.rejectedWith("Order: Wrong sides")

    // Sender is not the taker
    await expect(dyve.matchAskWithTakerBid(takerOrder, makerOrder, { value: totalAmount }))
      .to.be.rejectedWith("Order: Taker must be the sender")

    // Signer is the zero address
    const zeroAddressMaker = { ...makerOrder, signer: ethers.constants.AddressZero }
    await expect(dyve.connect(addr1).matchAskWithTakerBid(takerOrder, zeroAddressMaker, { value: totalAmount }))
      .to.be.rejectedWith("Order: Invalid signer")

    // fee is zero
    const feeZeroMaker = { ...makerOrder, fee: ethers.utils.parseEther("0").toString() }
    await expect(dyve.connect(addr1).matchAskWithTakerBid(takerOrder, feeZeroMaker, { value: totalAmount }))
      .to.be.rejectedWith("Order: fee cannot be 0")

    // collateral is zero
    const collateralZeroMaker = { ...makerOrder, collateral: ethers.utils.parseEther("0").toString() }
    await expect(dyve.connect(addr1).matchAskWithTakerBid(takerOrder, collateralZeroMaker, { value: totalAmount }))
      .to.be.rejectedWith("Order: collateral cannot be 0")

    // currency is not whitelisted
    const currencyNotWhitelistedMaker = { ...makerOrder, currency: mockUSDC.address }
    await expect(dyve.connect(addr1).matchAskWithTakerBid(takerOrder, currencyNotWhitelistedMaker, { value: totalAmount }))
      .to.be.rejectedWith("Order: currency not whitelisted")

    // invalid v parameter
    const invalidVSignatureMaker = { ...makerOrder, v: 1 }
    await expect(dyve.connect(addr1).matchAskWithTakerBidUsingETHAndWETH(takerOrder, invalidVSignatureMaker, { value: totalAmount }))
      .to.be.rejectedWith("Signature: Invalid v parameter")

    // invalid signature signer
    const invalidSignerMaker = { ...makerOrder, s: ethers.constants.HashZero }
    await expect(dyve.connect(addr1).matchAskWithTakerBidUsingETHAndWETH(takerOrder, invalidSignerMaker, { value: totalAmount }))
      .to.be.rejectedWith("Signature: Invalid signer")

    // invalid signature
    const invalidSignatureMaker = { ...makerOrder, s: ethers.utils.hexlify(ethers.utils.randomBytes(32)) }
    await expect(dyve.connect(addr1).matchAskWithTakerBidUsingETHAndWETH(takerOrder, invalidSignatureMaker, { value: totalAmount }))
      .to.be.rejectedWith("Signature: Invalid")
  })

  it("consumes maker bid (offer) with taker ask using USDC", async () => {
    const data = {
      isOrderAsk: false,
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
    const takerOrder = {
      isOrderAsk: true,
      taker: owner.address,
      collateral: makerOrder.collateral,
      fee: makerOrder.fee,
      tokenId: makerOrder.tokenId,
    }

    const addCurrencyTx = await dyve.addWhitelistedCurrency(mockUSDC.address)
    await addCurrencyTx.wait()

    const borrowTx = await dyve.matchBidWithTakerAsk(takerOrder, makerOrder)
    await borrowTx.wait()

    const takerOrderHash = computeOrderHash(data)
    const order = await dyve.orders(takerOrderHash)

    const { timestamp } = await ethers.provider.getBlock(borrowTx.blockNumber)

    expect(lender.ownerOf(1)).to.eventually.equal(addr1.address);
    await expect(mockUSDC.balanceOf(dyve.address)).to.eventually.equal(ethers.utils.parseEther("1"));
    await expect(mockUSDC.balanceOf(owner.address)).to.eventually.equal(ethers.utils.parseEther(String(30 + (0.1 * 0.98))));
    await expect(mockUSDC.balanceOf(addr1.address)).to.eventually.equal(ethers.utils.parseEther(String(30 - 1.1)));
    await expect(mockUSDC.balanceOf(protocolFeeRecipient.address)).to.eventually.equal(ethers.utils.parseEther(String(30 + (0.1 * 0.02))));

    expect(order.orderHash).to.equal(order.orderHash);
    expect(order.lender).to.equal(takerOrder.taker);
    expect(order.borrower).to.equal(makerOrder.signer);
    expect(order.collection).to.equal(data.collection);
    expect(order.tokenId).to.equal(data.tokenId);
    expect(order.expiryDateTime).to.equal(timestamp + data.duration);
    expect(order.collateral).to.equal(data.collateral);
    expect(order.currency).to.equal(mockUSDC.address);
    expect(order.status).to.equal(0);

    await expect(borrowTx)
    .to.emit(dyve, "TakerAsk")
    .withArgs(
      order.orderHash,
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

    await expect(dyve.matchBidWithTakerAsk(takerOrder, makerOrder))
      .to.be.rejectedWith("Order: Matching order listing expired")
  })

  it("checks validation for matchBidWithTakerAsk", async () => {
    const data = {
      isOrderAsk: false,
      signer: addr1.address,
      collection: lender.address,
      tokenId: 1,
      duration: 10800,
      collateral: ethers.utils.parseEther("1").toString(),
      fee: ethers.utils.parseEther("0.1").toString(),
      currency: weth.address,
      nonce: 100,
      startTime: Math.floor(Date.now() / 1000),
      endTime: Math.floor(Date.now() / 1000) + 86400,
    }

    const signature = await generateSignature(data, owner, dyve)
    const makerOrder = { ...data, ...signature }
    const takerOrder = {
      isOrderAsk: true,
      taker: owner.address,
      collateral: makerOrder.collateral,
      fee: makerOrder.fee,
      tokenId: makerOrder.tokenId,
    }

    // wrong sides of maker and taker
    const wrongMaker = { ...makerOrder, isOrderAsk: true }
    const wrongTaker = { ...takerOrder, isOrderAsk: false }
    await expect(dyve.matchBidWithTakerAsk(wrongTaker, makerOrder))
      .to.be.rejectedWith("Order: Wrong sides")
    await expect(dyve.matchBidWithTakerAsk(takerOrder, wrongMaker))
      .to.be.rejectedWith("Order: Wrong sides")
    await expect(dyve.matchBidWithTakerAsk(wrongTaker, wrongMaker))
      .to.be.rejectedWith("Order: Wrong sides")

    // Sender is not the taker
    await expect(dyve.connect(addr1).matchBidWithTakerAsk(takerOrder, makerOrder))
      .to.be.rejectedWith("Order: Taker must be the sender")

    // Signer is the zero address
    const zeroAddressMaker = { ...makerOrder, signer: ethers.constants.AddressZero }
    await expect(dyve.matchBidWithTakerAsk(takerOrder, zeroAddressMaker))
      .to.be.rejectedWith("Order: Invalid signer")

    // fee is zero
    const feeZeroMaker = { ...makerOrder, fee: ethers.utils.parseEther("0").toString() }
    await expect(dyve.matchBidWithTakerAsk(takerOrder, feeZeroMaker))
      .to.be.rejectedWith("Order: fee cannot be 0")

    // collateral is zero
    const collateralZeroMaker = { ...makerOrder, collateral: ethers.utils.parseEther("0").toString() }
    await expect(dyve.matchBidWithTakerAsk(takerOrder, collateralZeroMaker))
      .to.be.rejectedWith("Order: collateral cannot be 0")

    // currency is not whitelisted
    const currencyNotWhitelistedMaker = { ...makerOrder, currency: mockUSDC.address }
    await expect(dyve.matchBidWithTakerAsk(takerOrder, currencyNotWhitelistedMaker))
      .to.be.rejectedWith("Order: currency not whitelisted")

    // invalid v parameter
    const invalidVSignatureMaker = { ...makerOrder, v: 1 }
    await expect(dyve.matchBidWithTakerAsk(takerOrder, invalidVSignatureMaker))
      .to.be.rejectedWith("Signature: Invalid v parameter")

    // invalid signature signer
    const invalidSignerMaker = { ...makerOrder, s: ethers.constants.HashZero }
    await expect(dyve.matchBidWithTakerAsk(takerOrder, invalidSignerMaker))
      .to.be.rejectedWith("Signature: Invalid signer")

    // invalid signature
    const invalidSignatureMaker = { ...makerOrder, s: ethers.utils.hexlify(ethers.utils.randomBytes(32)) }
    await expect(dyve.matchBidWithTakerAsk(takerOrder, invalidSignatureMaker))
      .to.be.rejectedWith("Signature: Invalid")
  })

  it("consumes Maker Bid Listing then closes the position", async () => {
    const data = {
      isOrderAsk: true,
      signer: owner.address,
      collection: lender.address,
      tokenId: 1,
      duration: 10800,
      collateral: ethers.utils.parseEther("1").toString(),
      fee: ethers.utils.parseEther("0.1").toString(),
      currency: weth.address,
      nonce: 100,
      startTime: Math.floor(Date.now() / 1000),
      endTime: Math.floor(Date.now() / 1000) + 86400,
    }

    const signature = await generateSignature(data, owner, dyve)
    const makerOrder = { ...data, ...signature }
    const takerOrder = {
      isOrderAsk: false,
      taker: addr1.address,
      collateral: makerOrder.collateral,
      fee: makerOrder.fee,
      tokenId: makerOrder.tokenId,
    }

    const totalAmount = ethers.utils.parseEther("1.1").toString();
    const borrowTx = await dyve.connect(addr1).matchAskWithTakerBid(takerOrder, makerOrder, { value: totalAmount })
    await borrowTx.wait();

    const makerOrderHash = computeOrderHash(data);
    const closeTx = await dyve.connect(addr1).closePosition(makerOrderHash, data.tokenId);
    await closeTx.wait();

    const order = await dyve.orders(makerOrderHash)

    // 29 + 1 - 0.1
    // 29 = current balance
    // 1 = collateral
    // 0.1 = fee
    await expect(weth.balanceOf(addr1.address)).to.eventually.equal(ethers.utils.parseEther(String(29 + 1 - 0.1)))
    await expect(weth.balanceOf(dyve.address)).to.eventually.equal(ethers.utils.parseEther("0"));
    expect(lender.ownerOf(1)).to.eventually.equal(owner.address);

    expect(order.status).to.equal(2);

    await expect(closeTx)
    .to.emit(dyve, "Close")
    .withArgs(
      order.orderHash,
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
      isOrderAsk: true,
      signer: owner.address,
      collection: lender.address,
      tokenId: 1,
      duration: 10800,
      collateral: ethers.utils.parseEther("1").toString(),
      fee: ethers.utils.parseEther("0.1").toString(),
      currency: weth.address,
      nonce: 100,
      startTime: Math.floor(Date.now() / 1000),
      endTime: Math.floor(Date.now() / 1000) + 86400,
    }

    const signature = await generateSignature(data, owner, dyve)
    const makerOrder = { ...data, ...signature }
    const takerOrder = {
      isOrderAsk: false,
      taker: addr1.address,
      collateral: makerOrder.collateral,
      fee: makerOrder.fee,
      tokenId: makerOrder.tokenId,
    }

    const totalAmount = ethers.utils.parseEther("1.1").toString();
    const borrowTx = await dyve.connect(addr1).matchAskWithTakerBid(takerOrder, makerOrder, { value: totalAmount })
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


  it("consumes Maker Bid Listing then the lender claims the collateral", async () => {
    const data = {
      isOrderAsk: true,
      signer: owner.address,
      collection: lender.address,
      tokenId: 1,
      duration: 10800,
      collateral: ethers.utils.parseEther("1").toString(),
      fee: ethers.utils.parseEther("0.1").toString(),
      currency: weth.address,
      nonce: 100,
      startTime: Math.floor(Date.now() / 1000),
      endTime: Math.floor(Date.now() / 1000) + 86400,
    }

    const signature = await generateSignature(data, owner, dyve)
    const makerOrder = { ...data, ...signature }
    const takerOrder = {
      isOrderAsk: false,
      taker: addr1.address,
      collateral: makerOrder.collateral,
      fee: makerOrder.fee,
      tokenId: makerOrder.tokenId,
    }

    const totalAmount = ethers.utils.parseEther("1.1").toString();
    const borrowTx = await dyve.connect(addr1).matchAskWithTakerBid(takerOrder, makerOrder, { value: totalAmount })
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
    await expect(weth.balanceOf(owner.address)).to.eventually.equal(ethers.utils.parseEther(String(30 + (0.1 * 0.98) + 1)))
    await expect(weth.balanceOf(dyve.address)).to.eventually.equal(ethers.utils.parseEther("0"))
    expect(order.status).to.equal(1);

    await expect(claimTx)
    .to.emit(dyve, "Claim")
    .withArgs(
      order.orderHash,
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
      isOrderAsk: true,
      signer: owner.address,
      collection: lender.address,
      tokenId: 1,
      duration: 10800,
      collateral: ethers.utils.parseEther("1").toString(),
      fee: ethers.utils.parseEther("0.1").toString(),
      currency: weth.address,
      nonce: 100,
      startTime: Math.floor(Date.now() / 1000),
      endTime: Math.floor(Date.now() / 1000) + 86400,
    }

    const signature = await generateSignature(data, owner, dyve)
    const makerOrder = { ...data, ...signature }
    const takerOrder = {
      isOrderAsk: false,
      taker: addr1.address,
      collateral: makerOrder.collateral,
      fee: makerOrder.fee,
      tokenId: makerOrder.tokenId,
    }

    const totalAmount = ethers.utils.parseEther("1.1").toString();
    const borrowTx = await dyve.connect(addr1).matchAskWithTakerBid(takerOrder, makerOrder, { value: totalAmount })
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
      isOrderAsk: true,
      signer: owner.address,
      collection: lender.address,
      tokenId: 1,
      duration: 10800,
      collateral: ethers.utils.parseEther("1").toString(),
      fee: ethers.utils.parseEther("0.1").toString(),
      currency: weth.address,
      nonce: 100,
      startTime: Math.floor(Date.now() / 1000),
      endTime: Math.floor(Date.now() / 1000) + 86400,
    }

    const signature = await generateSignature(data, owner, dyve)
    const makerOrder = { ...data, ...signature }
    const takerOrder = {
      isOrderAsk: false,
      taker: addr1.address,
      collateral: makerOrder.collateral,
      fee: makerOrder.fee,
      tokenId: makerOrder.tokenId,
    }

    const totalAmount = ethers.utils.parseEther("1.1").toString();
    await expect(dyve.connect(addr1).matchAskWithTakerBid(takerOrder, makerOrder, { value: totalAmount }))
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
      isOrderAsk: true,
      signer: owner.address,
      collection: lender.address,
      tokenId: 1,
      duration: 10800,
      collateral: ethers.utils.parseEther("1").toString(),
      fee: ethers.utils.parseEther("0.1").toString(),
      currency: weth.address,
      nonce: 100,
      startTime: Math.floor(Date.now() / 1000),
      endTime: Math.floor(Date.now() / 1000) + 86400,
    }

    const signature = await generateSignature(data, owner, dyve)
    const makerOrder = { ...data, ...signature }
    const takerOrder = {
      isOrderAsk: false,
      taker: addr1.address,
      collateral: makerOrder.collateral,
      fee: makerOrder.fee,
      tokenId: makerOrder.tokenId,
    }

    const totalAmount = ethers.utils.parseEther("1.1").toString();
    await expect(dyve.connect(addr1).matchAskWithTakerBid(takerOrder, makerOrder, { value: totalAmount }))
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
