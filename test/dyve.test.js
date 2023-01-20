const { expect, use } = require("chai")
const { ethers } = require("hardhat")
const { setup, tokenSetup, generateSignature, computeOrderHash } = require("./helpers")
use(require('chai-as-promised'))

const { solidityKeccak256, keccak256, defaultAbiCoder } = ethers.utils;

let accounts;
let owner;
let addr1;
let addr2;
let addrs;
let protocolFeeRecipient;
let weth;
let mockUSDC;
let mockERC721;
let dyve;
let lender;

before(async () => {
  try {
    await network.provider.send("evm_setNextBlockTimestamp", [
      Math.floor(Date.now() / 1000) + 10,
    ]);
    await network.provider.send("evm_mine");
  } catch {}
});

beforeEach(async function () {
  accounts = await ethers.getSigners(); 
  [owner, addr1, addr2, ...addrs] = accounts;
  protocolFeeRecipient = addr2;

  [lender, weth, mockUSDC, mockERC721, whitelistedCurrencies, premiumCollections, dyve] = await setup(protocolFeeRecipient)
  await tokenSetup([owner, addr1, addr2], weth, mockUSDC, lender, mockERC721, whitelistedCurrencies, premiumCollections, dyve)
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
  })

  it("consumes maker ask (listing) with taker bid using ETH", async () => {
    const data = {
      orderType: 0,
      signer: owner.address,
      collection: lender.address,
      tokenId: 1,
      amount: 1,
      duration: 10800,
      collateral: ethers.utils.parseEther("1").toString(),
      fee: ethers.utils.parseEther("0.1").toString(),
      currency: ethers.constants.AddressZero,
      nonce: 100,
      premiumCollection: ethers.constants.AddressZero,
      premiumTokenId: 0,
      startTime: Math.floor(Date.now() / 1000),
      endTime: Math.floor(Date.now() / 1000) + 86400,
      tokenFlaggingId: ethers.constants.HashZero,
    }

    const signature = await generateSignature(data, owner, dyve)
    const makerOrder = { ...data,  signature }

    const borrowTx = await dyve.connect(addr1).fulfillOrder(makerOrder, { value: ethers.utils.parseEther("1.1").toString() })
    await borrowTx.wait()

    const makerOrderHash = computeOrderHash(data)
    const order = await dyve.orders(makerOrderHash)

    const { timestamp } = await ethers.provider.getBlock(borrowTx.blockNumber)

    expect(lender.ownerOf(1)).to.eventually.equal(addr1.address);
    await expect(() => borrowTx).to.changeEtherBalance(dyve, ethers.utils.parseEther("1"));
    await expect(() => borrowTx).to.changeEtherBalance(owner, ethers.utils.parseEther("0.08"));
    await expect(() => borrowTx).to.changeEtherBalance(protocolFeeRecipient, ethers.utils.parseEther("0.02"));
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
      order.amount,
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
      amount: 1,
      duration: 10800,
      collateral: ethers.utils.parseEther("1").toString(),
      fee: ethers.utils.parseEther("0.1").toString(),
      currency: mockUSDC.address,
      nonce: 100,
      premiumCollection: ethers.constants.AddressZero,
      premiumTokenId: 0,
      startTime: Math.floor(Date.now() / 1000),
      endTime: Math.floor(Date.now() / 1000) + 86400,
      tokenFlaggingId: ethers.constants.HashZero,
    }

    const signature = await generateSignature(data, owner, dyve)
    const makerOrder = { ...data, signature }

    const addCurrencyTx = await whitelistedCurrencies.addWhitelistedCurrency(mockUSDC.address)
    await addCurrencyTx.wait()

    const borrowTx = await dyve.connect(addr1).fulfillOrder(makerOrder)
    await borrowTx.wait()

    const makerOrderHash = computeOrderHash(data)
    const order = await dyve.orders(makerOrderHash)

    const { timestamp } = await ethers.provider.getBlock(borrowTx.blockNumber)

    expect(lender.ownerOf(1)).to.eventually.equal(addr1.address);
    await expect(mockUSDC.balanceOf(dyve.address)).to.eventually.equal(ethers.utils.parseEther("1"));
    await expect(mockUSDC.balanceOf(owner.address)).to.eventually.equal(ethers.utils.parseEther(String(30 + (0.1 * 0.8))));
    await expect(mockUSDC.balanceOf(addr1.address)).to.eventually.equal(ethers.utils.parseEther(String(30 - 1.1)));
    await expect(mockUSDC.balanceOf(protocolFeeRecipient.address)).to.eventually.equal(ethers.utils.parseEther(String(30 + (0.1 * 0.2))));

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
      order.amount,
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

  it("consumes maker ask (listing) with taker bid using USDC and the maker owns an NFT from a premium collection with zero fees", async () => {
    const data = {
      orderType: 2,
      signer: owner.address,
      collection: lender.address,
      tokenId: 1,
      amount: 1,
      duration: 10800,
      collateral: ethers.utils.parseEther("1").toString(),
      fee: ethers.utils.parseEther("0.1").toString(),
      currency: mockUSDC.address,
      nonce: 100,
      premiumCollection: mockERC721.address,
      premiumTokenId: 1,
      startTime: Math.floor(Date.now() / 1000),
      endTime: Math.floor(Date.now() / 1000) + 86400,
      tokenFlaggingId: ethers.constants.HashZero,
    }

    const mintTx = await mockERC721.mint();
    await mintTx.wait()

    const signature = await generateSignature(data, owner, dyve)
    const makerOrder = { ...data, signature }

    const addCurrencyTx = await whitelistedCurrencies.addWhitelistedCurrency(mockUSDC.address)
    await addCurrencyTx.wait()

    const borrowTx = await dyve.connect(addr1).fulfillOrder(makerOrder)
    await borrowTx.wait()

    expect(lender.ownerOf(1)).to.eventually.equal(addr1.address);
    await expect(mockUSDC.balanceOf(dyve.address)).to.eventually.equal(ethers.utils.parseEther("1"));
    await expect(mockUSDC.balanceOf(owner.address)).to.eventually.equal(ethers.utils.parseEther(String(30 + 0.1)));
    await expect(mockUSDC.balanceOf(addr1.address)).to.eventually.equal(ethers.utils.parseEther(String(30 - 1.1)));
    await expect(mockUSDC.balanceOf(protocolFeeRecipient.address)).to.eventually.equal(ethers.utils.parseEther("30"))
  })


  it("consumes maker ask (listing) with taker bid using USDC and the maker owns an NFT from a premium collection with non-zero fees", async () => {
    const data = {
      orderType: 2,
      signer: owner.address,
      collection: lender.address,
      tokenId: 1,
      amount: 1,
      duration: 10800,
      collateral: ethers.utils.parseEther("1").toString(),
      fee: ethers.utils.parseEther("0.1").toString(),
      currency: mockUSDC.address,
      nonce: 100,
      premiumCollection: mockERC721.address,
      premiumTokenId: 1,
      startTime: Math.floor(Date.now() / 1000),
      endTime: Math.floor(Date.now() / 1000) + 86400,
      tokenFlaggingId: ethers.constants.HashZero,
    }

    const mintTx = await mockERC721.mint();
    await mintTx.wait()

    const addPremiumCollectionTx = await premiumCollections.updatePremiumCollection(mockERC721.address, 100)
    await addPremiumCollectionTx.wait()

    const signature = await generateSignature(data, owner, dyve)
    const makerOrder = { ...data, signature }

    const addCurrencyTx = await whitelistedCurrencies.addWhitelistedCurrency(mockUSDC.address)
    await addCurrencyTx.wait()

    const borrowTx = await dyve.connect(addr1).fulfillOrder(makerOrder)
    await borrowTx.wait()

    expect(lender.ownerOf(1)).to.eventually.equal(addr1.address);
    await expect(mockUSDC.balanceOf(dyve.address)).to.eventually.equal(ethers.utils.parseEther("1"));
    await expect(mockUSDC.balanceOf(owner.address)).to.eventually.equal(ethers.utils.parseEther(String(30 + (0.1 * 0.99))));
    await expect(mockUSDC.balanceOf(addr1.address)).to.eventually.equal(ethers.utils.parseEther(String(30 - 1.1)));
    await expect(mockUSDC.balanceOf(protocolFeeRecipient.address)).to.eventually.equal(ethers.utils.parseEther(String(30 + (0.1 * 0.01))));
  })


  it("consumes maker ask (listing) with taker bid using USDC and the maker uses a non premium collection in the premium collection maker field", async () => {
    const data = {
      orderType: 2,
      signer: owner.address,
      collection: lender.address,
      tokenId: 1,
      amount: 1,
      duration: 10800,
      collateral: ethers.utils.parseEther("1").toString(),
      fee: ethers.utils.parseEther("0.1").toString(),
      currency: mockUSDC.address,
      nonce: 100,
      premiumCollection: lender.address,
      premiumTokenId: 1,
      startTime: Math.floor(Date.now() / 1000),
      endTime: Math.floor(Date.now() / 1000) + 86400,
      tokenFlaggingId: ethers.constants.HashZero,
    }

    const mintTx = await mockERC721.mint();
    await mintTx.wait()

    const addPremiumCollectionTx = await premiumCollections.updatePremiumCollection(mockERC721.address, 100)
    await addPremiumCollectionTx.wait()

    const signature = await generateSignature(data, owner, dyve)
    const makerOrder = { ...data, signature }

    const addCurrencyTx = await whitelistedCurrencies.addWhitelistedCurrency(mockUSDC.address)
    await addCurrencyTx.wait()

    const borrowTx = await dyve.connect(addr1).fulfillOrder(makerOrder)
    await borrowTx.wait()

    expect(lender.ownerOf(1)).to.eventually.equal(addr1.address);
    await expect(mockUSDC.balanceOf(dyve.address)).to.eventually.equal(ethers.utils.parseEther("1"));
    await expect(mockUSDC.balanceOf(owner.address)).to.eventually.equal(ethers.utils.parseEther(String(30 + (0.1 * 0.8))));
    await expect(mockUSDC.balanceOf(addr1.address)).to.eventually.equal(ethers.utils.parseEther(String(30 - 1.1)));
    await expect(mockUSDC.balanceOf(protocolFeeRecipient.address)).to.eventually.equal(ethers.utils.parseEther(String(30 + (0.1 * 0.2))));
  })


  it("consumes maker ask (listing) with taker bid using USDC and the maker uses a premium collection, but does not own the specified token in the maker order", async () => {
    const data = {
      orderType: 2,
      signer: owner.address,
      collection: lender.address,
      tokenId: 1,
      amount: 1,
      duration: 10800,
      collateral: ethers.utils.parseEther("1").toString(),
      fee: ethers.utils.parseEther("0.1").toString(),
      currency: mockUSDC.address,
      nonce: 100,
      premiumCollection: mockERC721.address,
      premiumTokenId: 1,
      startTime: Math.floor(Date.now() / 1000),
      endTime: Math.floor(Date.now() / 1000) + 86400,
      tokenFlaggingId: ethers.constants.HashZero,
    }

    const mintTx = await mockERC721.connect(addr1).mint();
    await mintTx.wait()

    const addPremiumCollectionTx = await premiumCollections.updatePremiumCollection(mockERC721.address, 100)
    await addPremiumCollectionTx.wait()

    const signature = await generateSignature(data, owner, dyve)
    const makerOrder = { ...data, signature }

    const addCurrencyTx = await whitelistedCurrencies.addWhitelistedCurrency(mockUSDC.address)
    await addCurrencyTx.wait()

    const borrowTx = await dyve.connect(addr1).fulfillOrder(makerOrder)
    await borrowTx.wait()

    expect(lender.ownerOf(1)).to.eventually.equal(addr1.address);
    await expect(mockUSDC.balanceOf(dyve.address)).to.eventually.equal(ethers.utils.parseEther("1"));
    await expect(mockUSDC.balanceOf(owner.address)).to.eventually.equal(ethers.utils.parseEther(String(30 + (0.1 * 0.8))));
    await expect(mockUSDC.balanceOf(addr1.address)).to.eventually.equal(ethers.utils.parseEther(String(30 - 1.1)));
    await expect(mockUSDC.balanceOf(protocolFeeRecipient.address)).to.eventually.equal(ethers.utils.parseEther(String(30 + (0.1 * 0.2))));
  })



  it("consumes maker bid (offer) with taker ask using USDC", async () => {
    const data = {
      orderType: 4,
      signer: addr1.address,
      collection: lender.address,
      tokenId: 1,
      amount: 1,
      duration: 10800,
      collateral: ethers.utils.parseEther("1").toString(),
      fee: ethers.utils.parseEther("0.1").toString(),
      currency: mockUSDC.address,
      nonce: 100,
      premiumCollection: ethers.constants.AddressZero,
      premiumTokenId: 0,
      startTime: Math.floor(Date.now() / 1000),
      endTime: Math.floor(Date.now() / 1000) + 86400,
      tokenFlaggingId: ethers.constants.HashZero,
    }

    const signature = await generateSignature(data, addr1, dyve)
    const makerOrder = { ...data, signature }

    const addCurrencyTx = await whitelistedCurrencies.addWhitelistedCurrency(mockUSDC.address)
    await addCurrencyTx.wait()

    const borrowTx = await dyve.fulfillOrder(makerOrder)
    await borrowTx.wait()

    const makerOrderHash = computeOrderHash(data)
    const order = await dyve.orders(makerOrderHash)

    const { timestamp } = await ethers.provider.getBlock(borrowTx.blockNumber)

    expect(lender.ownerOf(1)).to.eventually.equal(addr1.address);
    await expect(mockUSDC.balanceOf(dyve.address)).to.eventually.equal(ethers.utils.parseEther("1"));
    await expect(mockUSDC.balanceOf(owner.address)).to.eventually.equal(ethers.utils.parseEther(String(30 + (0.1 * 0.8))));
    await expect(mockUSDC.balanceOf(addr1.address)).to.eventually.equal(ethers.utils.parseEther(String(30 - 1.1)));
    await expect(mockUSDC.balanceOf(protocolFeeRecipient.address)).to.eventually.equal(ethers.utils.parseEther(String(30 + (0.1 * 0.2))));

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
      order.amount,
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
      amount: 1,
      duration: 10800,
      collateral: ethers.utils.parseEther("1").toString(),
      fee: ethers.utils.parseEther("0.1").toString(),
      currency: ethers.constants.AddressZero,
      nonce: 100,
      premiumCollection: ethers.constants.AddressZero,
      premiumTokenId: 0,
      startTime: Math.floor(Date.now() / 1000),
      endTime: Math.floor(Date.now() / 1000) + 86400,
      tokenFlaggingId: ethers.constants.HashZero,
    }

    const signature = await generateSignature(data, owner, dyve)
    const makerOrder = { ...data, signature }

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

    // listing has expired
    const expiredListingMaker = { ...makerOrder, endTime: data.startTime - 100 }
    await expect(dyve.connect(addr1).fulfillOrder(expiredListingMaker, { value: totalAmount }))
      .to.be.rejectedWith("Order: Order listing expired")

    // fee is zero
    const feeZeroMaker = { ...makerOrder, fee: ethers.utils.parseEther("0").toString() }
    await expect(dyve.connect(addr1).fulfillOrder(feeZeroMaker, { value: ethers.utils.parseEther("1") }))
      .to.be.rejectedWith("Order: fee cannot be 0")

    // collateral is zero
    const collateralZeroMaker = { ...makerOrder, collateral: ethers.utils.parseEther("0").toString() }
    await expect(dyve.connect(addr1).fulfillOrder(collateralZeroMaker, { value: ethers.utils.parseEther("0.1") }))
      .to.be.rejectedWith("Order: collateral cannot be 0")

    // invalid signature
    const invalidSignatureMaker = { ...makerOrder, signature: ethers.utils.hexlify(ethers.utils.randomBytes(32)) }
    await expect(dyve.connect(addr1).fulfillOrder(invalidSignatureMaker, { value: totalAmount }))
      .to.be.rejectedWith("Signature: Invalid")
  })

  it("consumes Maker Bid Listing (using ETH) then the lender claims the collateral", async () => {
    const data = {
      orderType: 0,
      signer: owner.address,
      collection: lender.address,
      tokenId: 1,
      amount: 1,
      duration: 100,
      collateral: ethers.utils.parseEther("1").toString(),
      fee: ethers.utils.parseEther("0.1").toString(),
      currency: ethers.constants.AddressZero,
      nonce: 100,
      premiumCollection: ethers.constants.AddressZero,
      premiumTokenId: 0,
      startTime: Math.floor(Date.now() / 1000),
      endTime: Math.floor(Date.now() / 1000) + 86400,
      tokenFlaggingId: ethers.constants.HashZero,
    }

    const signature = await generateSignature(data, owner, dyve)
    const makerOrder = { ...data, signature }

    const borrowTx = await dyve.connect(addr1).fulfillOrder(makerOrder, { value: ethers.utils.parseEther("1.1") })
    await borrowTx.wait();

    const { timestamp } = await ethers.provider.getBlock(borrowTx.blockNumber)
    await ethers.provider.send("evm_mine", [timestamp + 110]);

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
      order.amount,
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
      amount: 1,
      duration: 100,
      collateral: ethers.utils.parseEther("1").toString(),
      fee: ethers.utils.parseEther("0.1").toString(),
      currency: mockUSDC.address,
      nonce: 100,
      premiumCollection: ethers.constants.AddressZero,
      premiumTokenId: 0,
      startTime: Math.floor(Date.now() / 1000),
      endTime: Math.floor(Date.now() / 1000) + 86400,
      tokenFlaggingId: ethers.constants.HashZero,
    }

    const signature = await generateSignature(data, owner, dyve)
    const makerOrder = { ...data, signature }

    const whitelistTx = await whitelistedCurrencies.addWhitelistedCurrency(mockUSDC.address)
    await whitelistTx.wait()

    const borrowTx = await dyve.connect(addr1).fulfillOrder(makerOrder)
    await borrowTx.wait();

    const { timestamp } = await ethers.provider.getBlock(borrowTx.blockNumber)
    await ethers.provider.send("evm_mine", [timestamp + 110]);

    const makerOrderHash = computeOrderHash(data);
    const claimTx = await dyve.claimCollateral(makerOrderHash);
    await claimTx.wait();

    const order = await dyve.orders(makerOrderHash);

    // 30 ETH + 1 ETH - (0.1 * 0.8) ETH
    // 30 = originally balance
    // 1 = collateral
    // (0.1 * 0.8) = final lender fee after protocol fee cut
    await expect(mockUSDC.balanceOf(owner.address)).to.eventually.equal(ethers.utils.parseEther(String(30 + (0.1 * 0.8) + 1)))
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
      order.amount,
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
      amount: 1,
      duration: 100,
      collateral: ethers.utils.parseEther("1").toString(),
      fee: ethers.utils.parseEther("0.1").toString(),
      currency: ethers.constants.AddressZero,
      nonce: 100,
      premiumCollection: ethers.constants.AddressZero,
      premiumTokenId: 0,
      startTime: Math.floor(Date.now() / 1000),
      endTime: Math.floor(Date.now() / 1000) + 86400,
      tokenFlaggingId: ethers.constants.HashZero,
    }

    const signature = await generateSignature(data, owner, dyve)
    const makerOrder = { ...data, signature }

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
    await ethers.provider.send("evm_mine", [timestamp + 110]);
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
      amount: 1,
      duration: 10800,
      collateral: ethers.utils.parseEther("1").toString(),
      fee: ethers.utils.parseEther("0.1").toString(),
      currency: ethers.constants.AddressZero,
      nonce: 100,
      premiumCollection: ethers.constants.AddressZero,
      premiumTokenId: 0,
      startTime: Math.floor(Date.now() / 1000),
      endTime: Math.floor(Date.now() / 1000) + 86400,
      tokenFlaggingId: ethers.constants.HashZero,
    }

    const signature = await generateSignature(data, owner, dyve)
    const makerOrder = { ...data, signature }

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
      amount: 1,
      duration: 10800,
      collateral: ethers.utils.parseEther("1").toString(),
      fee: ethers.utils.parseEther("0.1").toString(),
      currency: ethers.constants.AddressZero,
      nonce: 100,
      premiumCollection: ethers.constants.AddressZero,
      premiumTokenId: 0,
      startTime: Math.floor(Date.now() / 1000),
      endTime: Math.floor(Date.now() / 1000) + 86400,
      tokenFlaggingId: ethers.constants.HashZero,
    }

    const signature = await generateSignature(data, owner, dyve)
    const makerOrder = { ...data, signature }

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
