const { expect, use } = require("chai")
const { ethers } = require("hardhat")
const { setup, tokenSetup, generateSignature, computeMakerOrderHash, computeOrderHash, constructMessage, generateOrder, encodeTokenId } = require("./helpers")
use(require('chai-as-promised'))

const { solidityKeccak256, keccak256, defaultAbiCoder } = ethers.utils;

const ETH_TO_ERC721 = 0
const ETH_TO_ERC1155 = 1
const ERC20_TO_ERC721 = 2
const ERC20_TO_ERC1155 = 3
const ERC721_TO_ERC20 = 4
const ERC1155_TO_ERC20 = 5
const ERC721_TO_ERC20_COLLECTION = 6
const ERC1155_TO_ERC20_COLLECTION = 7

const EMPTY = 0
const BORROWED = 1
const EXPIRED = 2
const CLOSED = 3

let accounts;
let owner;
let addr1;
let addr2;
let addrs;
let reservoirOracleSigner;
let reservoirOracle;
let protocolFeeRecipient;
let weth;
let mockUSDC;
let premiumCollection;
let mockERC1155;
let dyve;
let mockERC721;

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
  reservoirOracleSigner = owner;
  protocolFeeRecipient = addr2;

  [weth, mockUSDC, mockERC721, mockERC1155, premiumCollection, whitelistedCurrencies, reservoirOracle, protocolFeeManager, dyve] = await setup(protocolFeeRecipient, reservoirOracleSigner)
  await tokenSetup([owner, addr1, addr2], weth, mockUSDC, mockERC721, mockERC1155, premiumCollection, whitelistedCurrencies, protocolFeeManager, dyve)
});

describe("Dyve", function () {
  describe("Initial checks", function () {
    it("checks initial properties were set correctly", async () => {
      const TestDyve = await ethers.getContractFactory("Dyve")

      await expect(TestDyve.deploy(ethers.constants.AddressZero, protocolFeeManager.address, reservoirOracleSigner.address, protocolFeeRecipient.address)).to.be.rejectedWith("InvalidAddress")
      await expect(TestDyve.deploy(whitelistedCurrencies.address, ethers.constants.AddressZero, reservoirOracleSigner.address, protocolFeeRecipient.address)).to.be.rejectedWith("InvalidAddress")
      await expect(TestDyve.deploy(whitelistedCurrencies.address, protocolFeeManager.address, ethers.constants.AddressZero, protocolFeeRecipient.address)).to.be.rejectedWith("InvalidAddress")
      await expect(TestDyve.deploy(whitelistedCurrencies.address, protocolFeeManager.address, reservoirOracleSigner.address, ethers.constants.AddressZero)).to.be.rejectedWith("InvalidAddress")

      const testDyve = await TestDyve.deploy(whitelistedCurrencies.address, protocolFeeManager.address, reservoirOracleSigner.address, protocolFeeRecipient.address)
      const receipt = await testDyve.deployTransaction.wait()
      const events = receipt.events.map(({ event }) => event)
        
      await expect(dyve.protocolFeeRecipient()).to.eventually.equal(protocolFeeRecipient.address)
    })
  })

  describe("Fulfill order functionality", function () {
    it("consumes maker ask (listing ERC721) with taker bid using ETH", async () => {
      const data = {
        orderType: ETH_TO_ERC721,
        signer: owner.address,
        collection: mockERC721.address,
        tokenId: 0,
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
      }

      const signature = await generateSignature(data, owner, dyve)
      const makerOrder = { ...data,  signature }

      const { timestamp: fulfillOrderTimestamp } = await ethers.provider.getBlock('latest');
      const message = await constructMessage({ 
        contract: mockERC721.address,
        tokenId: 0,
        isFlagged: false,
        timestamp: fulfillOrderTimestamp - 10,
        signer: reservoirOracleSigner,
      })

      const borrowTx = await dyve.connect(addr1).fulfillOrder(makerOrder, message, [], { value: ethers.utils.parseEther("1.1").toString() })
      await borrowTx.wait()

      const { timestamp } = await ethers.provider.getBlock(borrowTx.blockNumber)

      const orderHash = computeOrderHash(data, owner.address, addr1.address, timestamp + data.duration)
      const orderStatus = await dyve.orders(orderHash) 

      expect(orderStatus).to.equal(BORROWED);
      await expect(mockERC721.ownerOf(1)).to.eventually.equal(addr1.address);
      await expect(() => borrowTx).to.changeEtherBalance(dyve, ethers.utils.parseEther("1"));
      await expect(() => borrowTx).to.changeEtherBalance(owner, ethers.utils.parseEther("0.1"));
      await expect(() => borrowTx).to.changeEtherBalance(protocolFeeRecipient, ethers.utils.parseEther("0"));
      await expect(() => borrowTx).to.changeEtherBalance(addr1, ethers.utils.parseEther("-1.1"));

      await expect(borrowTx)
      .to.emit(dyve, "OrderCreated")
      .withArgs(
        orderHash,
        owner.address,
        addr1.address,
        data.orderType,
        data.collection,
        data.tokenId,
        data.amount,
        data.collateral,
        data.fee,
        data.currency,
        timestamp + data.duration,
      )

      await expect(dyve.connect(addr1).fulfillOrder(makerOrder, message, [], { value: ethers.utils.parseEther("1.1") }))
        .to.be.rejectedWith("ExpiredNonce")
    })

    it("consumes maker ask (listing ERC1155) with taker bid using ETH", async () => {
      const data = {
        orderType: ETH_TO_ERC1155,
        signer: owner.address,
        collection: mockERC1155.address,
        tokenId: 0,
        amount: 10,
        duration: 10800,
        collateral: ethers.utils.parseEther("1").toString(),
        fee: ethers.utils.parseEther("0.1").toString(),
        currency: ethers.constants.AddressZero,
        nonce: 100,
        premiumCollection: ethers.constants.AddressZero,
        premiumTokenId: 0,
        startTime: Math.floor(Date.now() / 1000),
        endTime: Math.floor(Date.now() / 1000) + 86400,
      }

      const signature = await generateSignature(data, owner, dyve)
      const makerOrder = { ...data,  signature }

      const { timestamp: fulfillOrderTimestamp } = await ethers.provider.getBlock('latest');
      const message = await constructMessage({ 
        contract: mockERC1155.address,
        tokenId: 0,
        isFlagged: false,
        timestamp: fulfillOrderTimestamp - 10,
        signer: reservoirOracleSigner,
      })

      const borrowTx = await dyve.connect(addr1).fulfillOrder(makerOrder, message, [], { value: ethers.utils.parseEther("1.1").toString() })
      await borrowTx.wait()

      const { timestamp } = await ethers.provider.getBlock(borrowTx.blockNumber)

      const orderHash = computeOrderHash(data, owner.address, addr1.address, timestamp + data.duration)
      const orderStatus = await dyve.orders(orderHash)

      expect(orderStatus).to.equal(BORROWED);
      await expect(mockERC1155.balanceOf(addr1.address, 0)).to.eventually.equal(10);
      await expect(() => borrowTx).to.changeEtherBalance(dyve, ethers.utils.parseEther("1"));
      await expect(() => borrowTx).to.changeEtherBalance(owner, ethers.utils.parseEther("0.1"));
      await expect(() => borrowTx).to.changeEtherBalance(protocolFeeRecipient, ethers.utils.parseEther("0"));
      await expect(() => borrowTx).to.changeEtherBalance(addr1, ethers.utils.parseEther("-1.1"));

      await expect(borrowTx)
      .to.emit(dyve, "OrderCreated")
      .withArgs(
        orderHash,
        owner.address,
        addr1.address,
        data.orderType,
        data.collection,
        data.tokenId,
        data.amount,
        data.collateral,
        data.fee,
        data.currency,
        timestamp + data.duration,
      )

      await expect(dyve.connect(addr1).fulfillOrder(makerOrder, message, [], { value: ethers.utils.parseEther("1.1") }))
        .to.be.rejectedWith("ExpiredNonce")
    })

    it("consumes maker ask (listing ERC721) with taker bid using USDC", async () => {
      const data = {
        orderType: ERC20_TO_ERC721,
        signer: owner.address,
        collection: mockERC721.address,
        tokenId: 0,
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
      }

      const signature = await generateSignature(data, owner, dyve)
      const makerOrder = { ...data, signature }

      const { timestamp: fulfillOrderTimestamp } = await ethers.provider.getBlock('latest');
      const message = await constructMessage({ 
        contract: mockERC721.address,
        tokenId: 0,
        isFlagged: false,
        timestamp: fulfillOrderTimestamp - 10,
        signer: reservoirOracleSigner,
      })

      const addCurrencyTx = await whitelistedCurrencies.addWhitelistedCurrency(mockUSDC.address)
      await addCurrencyTx.wait()

      const borrowTx = await dyve.connect(addr1).fulfillOrder(makerOrder, message, [])
      await borrowTx.wait()

      const { timestamp } = await ethers.provider.getBlock(borrowTx.blockNumber)

      const orderHash = computeOrderHash(data, owner.address, addr1.address, timestamp + data.duration)
      const orderStatus = await dyve.orders(orderHash)

      expect(orderStatus).to.equal(BORROWED);
      await expect(mockERC721.ownerOf(1)).to.eventually.equal(addr1.address);
      await expect(mockUSDC.balanceOf(dyve.address)).to.eventually.equal(ethers.utils.parseEther("1"));
      await expect(mockUSDC.balanceOf(owner.address)).to.eventually.equal(ethers.utils.parseEther(String(30 + 0.1)));
      await expect(mockUSDC.balanceOf(addr1.address)).to.eventually.equal(ethers.utils.parseEther(String(30 - 1.1)));
      await expect(mockUSDC.balanceOf(protocolFeeRecipient.address)).to.eventually.equal(ethers.utils.parseEther("30"));

      await expect(borrowTx)
      .to.emit(dyve, "OrderCreated")
      .withArgs(
        orderHash,
        owner.address,
        addr1.address,
        data.orderType,
        data.collection,
        data.tokenId,
        data.amount,
        data.collateral,
        data.fee,
        data.currency,
        timestamp + data.duration,
      ) 

      await expect(dyve.connect(addr1).fulfillOrder(makerOrder, message, []))
        .to.be.rejectedWith("ExpiredNonce")
    })

    it("consumes maker ask (listing ERC1155) with taker bid using USDC", async () => {
      const data = {
        orderType: ERC20_TO_ERC1155,
        signer: owner.address,
        collection: mockERC1155.address,
        tokenId: 0,
        amount: 10,
        duration: 10800,
        collateral: ethers.utils.parseEther("1").toString(),
        fee: ethers.utils.parseEther("0.1").toString(),
        currency: mockUSDC.address,
        nonce: 100,
        premiumCollection: ethers.constants.AddressZero,
        premiumTokenId: 0,
        startTime: Math.floor(Date.now() / 1000),
        endTime: Math.floor(Date.now() / 1000) + 86400,
      }

      const signature = await generateSignature(data, owner, dyve)
      const makerOrder = { ...data, signature }

      const { timestamp: fulfillOrderTimestamp } = await ethers.provider.getBlock('latest');
      const message = await constructMessage({ 
        contract: mockERC1155.address,
        tokenId: 0,
        isFlagged: false,
        timestamp: fulfillOrderTimestamp - 10,
        signer: reservoirOracleSigner,
      })

      const addCurrencyTx = await whitelistedCurrencies.addWhitelistedCurrency(mockUSDC.address)
      await addCurrencyTx.wait()

      const borrowTx = await dyve.connect(addr1).fulfillOrder(makerOrder, message, [])
      await borrowTx.wait()

      const { timestamp } = await ethers.provider.getBlock(borrowTx.blockNumber)

      const orderHash = computeOrderHash(data, owner.address, addr1.address, timestamp + data.duration)
      const orderStatus = await dyve.orders(orderHash)

      expect(orderStatus).to.equal(BORROWED);
      await expect(mockERC1155.balanceOf(addr1.address, 0)).to.eventually.equal(10);
      await expect(mockUSDC.balanceOf(dyve.address)).to.eventually.equal(ethers.utils.parseEther("1"));
      await expect(mockUSDC.balanceOf(owner.address)).to.eventually.equal(ethers.utils.parseEther(String(30 + 0.1)));
      await expect(mockUSDC.balanceOf(addr1.address)).to.eventually.equal(ethers.utils.parseEther(String(30 - 1.1)));
      await expect(mockUSDC.balanceOf(protocolFeeRecipient.address)).to.eventually.equal(ethers.utils.parseEther("30"));

      await expect(borrowTx)
      .to.emit(dyve, "OrderCreated")
      .withArgs(
        orderHash,
        owner.address,
        addr1.address,
        data.orderType,
        data.collection,
        data.tokenId,
        data.amount,
        data.collateral,
        data.fee,
        data.currency,
        timestamp + data.duration,
      )

      await expect(dyve.connect(addr1).fulfillOrder(makerOrder, message, []))
        .to.be.rejectedWith("ExpiredNonce")
    })

    it("consumes maker bid (offer ERC721) with taker ask using USDC", async () => {
      const data = {
        orderType: ERC721_TO_ERC20,
        signer: addr1.address,
        collection: mockERC721.address,
        tokenId: 0,
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
      }

      const signature = await generateSignature(data, addr1, dyve)
      const makerOrder = { ...data, signature }

      const { timestamp: fulfillOrderTimestamp } = await ethers.provider.getBlock('latest');
      const message = await constructMessage({ 
        contract: mockERC721.address,
        tokenId: 0,
        isFlagged: false,
        timestamp: fulfillOrderTimestamp - 10,
        signer: reservoirOracleSigner,
      })

      const addCurrencyTx = await whitelistedCurrencies.addWhitelistedCurrency(mockUSDC.address)
      await addCurrencyTx.wait()

      const borrowTx = await dyve.fulfillOrder(makerOrder, message, [])
      await borrowTx.wait()

      const { timestamp } = await ethers.provider.getBlock(borrowTx.blockNumber)

      const orderHash = computeOrderHash(data, owner.address, addr1.address, timestamp + data.duration)
      const orderStatus = await dyve.orders(orderHash)

      expect(orderStatus).to.equal(BORROWED);
      await expect(mockERC721.ownerOf(1)).to.eventually.equal(addr1.address);
      await expect(mockUSDC.balanceOf(dyve.address)).to.eventually.equal(ethers.utils.parseEther("1"));
      await expect(mockUSDC.balanceOf(owner.address)).to.eventually.equal(ethers.utils.parseEther(String(30 + 0.1)));
      await expect(mockUSDC.balanceOf(addr1.address)).to.eventually.equal(ethers.utils.parseEther(String(30 - 1.1)));
      await expect(mockUSDC.balanceOf(protocolFeeRecipient.address)).to.eventually.equal(ethers.utils.parseEther("30"));

      await expect(borrowTx)
      .to.emit(dyve, "OrderCreated")
      .withArgs(
        orderHash,
        owner.address,
        addr1.address,
        data.orderType,
        data.collection,
        data.tokenId,
        data.amount,
        data.collateral,
        data.fee,
        data.currency,
        timestamp + data.duration,
      )

      await expect(dyve.fulfillOrder(makerOrder, message, []))
        .to.be.rejectedWith("ExpiredNonce")
    })

    it("consumes maker bid (offer ERC1155) with taker ask using USDC", async () => {
      const data = {
        orderType: ERC1155_TO_ERC20,
        signer: addr1.address,
        collection: mockERC1155.address,
        tokenId: 0,
        amount: 10,
        duration: 10800,
        collateral: ethers.utils.parseEther("1").toString(),
        fee: ethers.utils.parseEther("0.1").toString(),
        currency: mockUSDC.address,
        nonce: 100,
        premiumCollection: ethers.constants.AddressZero,
        premiumTokenId: 0,
        startTime: Math.floor(Date.now() / 1000),
        endTime: Math.floor(Date.now() / 1000) + 86400,
      }

      const signature = await generateSignature(data, addr1, dyve)
      const makerOrder = { ...data, signature }

      const { timestamp: fulfillOrderTimestamp } = await ethers.provider.getBlock('latest');
      const message = await constructMessage({ 
        contract: mockERC1155.address,
        tokenId: 0,
        isFlagged: false,
        timestamp: fulfillOrderTimestamp - 10,
        signer: reservoirOracleSigner,
      })

      const addCurrencyTx = await whitelistedCurrencies.addWhitelistedCurrency(mockUSDC.address)
      await addCurrencyTx.wait()

      const borrowTx = await dyve.fulfillOrder(makerOrder, message, [])
      await borrowTx.wait()

      const { timestamp } = await ethers.provider.getBlock(borrowTx.blockNumber)

      const orderHash = computeOrderHash(data, owner.address, addr1.address, timestamp + data.duration)

      await expect(borrowTx)
      .to.emit(dyve, "OrderCreated")
      .withArgs(
        orderHash,
        owner.address,
        addr1.address,
        data.orderType,
        data.collection,
        data.tokenId,
        data.amount,
        data.collateral,
        data.fee,
        data.currency,
        timestamp + data.duration,
      )

      await expect(dyve.fulfillOrder(makerOrder, message, []))
        .to.be.rejectedWith("ExpiredNonce")
    })

    it("consumes maker collection bid (offer ERC721) with taker ask using USDC", async () => {
      const data = {
        orderType: ERC721_TO_ERC20_COLLECTION,
        signer: addr1.address,
        collection: mockERC721.address,
        tokenId: 0,
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
      }

      const signature = await generateSignature(data, addr1, dyve)
      const makerOrder = { ...data, signature }

      const { timestamp: fulfillOrderTimestamp } = await ethers.provider.getBlock('latest');
      const message = await constructMessage({ 
        contract: mockERC721.address,
        tokenId: 0,
        isFlagged: false,
        timestamp: fulfillOrderTimestamp - 10,
        signer: reservoirOracleSigner,
      })

      const addCurrencyTx = await whitelistedCurrencies.addWhitelistedCurrency(mockUSDC.address)
      await addCurrencyTx.wait()

      const borrowTx = await dyve.fulfillOrder(makerOrder, message, encodeTokenId(data.tokenId))
      await borrowTx.wait()

      const { timestamp } = await ethers.provider.getBlock(borrowTx.blockNumber)

      const orderHash = computeOrderHash(data, owner.address, addr1.address, timestamp + data.duration)
      const orderStatus = await dyve.orders(orderHash)

      expect(orderStatus).to.equal(BORROWED);
      await expect(mockERC721.ownerOf(1)).to.eventually.equal(addr1.address);
      await expect(mockUSDC.balanceOf(dyve.address)).to.eventually.equal(ethers.utils.parseEther("1"));
      await expect(mockUSDC.balanceOf(owner.address)).to.eventually.equal(ethers.utils.parseEther(String(30 + 0.1)));
      await expect(mockUSDC.balanceOf(addr1.address)).to.eventually.equal(ethers.utils.parseEther(String(30 - 1.1)));
      await expect(mockUSDC.balanceOf(protocolFeeRecipient.address)).to.eventually.equal(ethers.utils.parseEther("30"));

      await expect(borrowTx)
      .to.emit(dyve, "OrderCreated")
      .withArgs(
        orderHash,
        owner.address,
        addr1.address,
        data.orderType,
        data.collection,
        data.tokenId,
        data.amount,
        data.collateral,
        data.fee,
        data.currency,
        timestamp + data.duration,
      )

      await expect(dyve.fulfillOrder(makerOrder, message, encodeTokenId(data.tokenId)))
        .to.be.rejectedWith("ExpiredNonce")
    })

    it("consumes maker collection bid (offer ERC1155) with taker ask using USDC", async () => {
      const data = {
        orderType: ERC1155_TO_ERC20_COLLECTION,
        signer: addr1.address,
        collection: mockERC1155.address,
        tokenId: 0,
        amount: 10,
        duration: 10800,
        collateral: ethers.utils.parseEther("1").toString(),
        fee: ethers.utils.parseEther("0.1").toString(),
        currency: mockUSDC.address,
        nonce: 100,
        premiumCollection: ethers.constants.AddressZero,
        premiumTokenId: 0,
        startTime: Math.floor(Date.now() / 1000),
        endTime: Math.floor(Date.now() / 1000) + 86400,
      }

      const signature = await generateSignature(data, addr1, dyve)
      const makerOrder = { ...data, signature }

      const { timestamp: fulfillOrderTimestamp } = await ethers.provider.getBlock('latest');
      const message = await constructMessage({ 
        contract: mockERC1155.address,
        tokenId: 0,
        isFlagged: false,
        timestamp: fulfillOrderTimestamp - 10,
        signer: reservoirOracleSigner,
      })

      const addCurrencyTx = await whitelistedCurrencies.addWhitelistedCurrency(mockUSDC.address)
      await addCurrencyTx.wait()

      const borrowTx = await dyve.fulfillOrder(makerOrder, message, encodeTokenId(data.tokenId))
      await borrowTx.wait()

      const { timestamp } = await ethers.provider.getBlock(borrowTx.blockNumber)

      const orderHash = computeOrderHash(data, owner.address, addr1.address, timestamp + data.duration)
      const orderStatus = await dyve.orders(orderHash)

      await expect(borrowTx)
      .to.emit(dyve, "OrderCreated")
      .withArgs(
        orderHash,
        owner.address,
        addr1.address,
        data.orderType,
        data.collection,
        data.tokenId,
        data.amount,
        data.collateral,
        data.fee,
        data.currency,
        timestamp + data.duration,
      )

      await expect(dyve.fulfillOrder(makerOrder, message, encodeTokenId(data.tokenId)))
        .to.be.rejectedWith("ExpiredNonce")
    })

    it("checks validation for fulfillOrder", async () => {
      const data = {
        orderType: ETH_TO_ERC721,
        signer: owner.address,
        collection: mockERC721.address,
        tokenId: 0,
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
      }

      const signature = await generateSignature(data, owner, dyve)
      const makerOrder = { ...data, signature }

      const { timestamp } = await ethers.provider.getBlock('latest');
      const messageParams = {
        contract: mockERC721.address,
        tokenId: 0,
        isFlagged: false,
        timestamp: timestamp - 10,
        signer: reservoirOracleSigner
      } 
      const message = await constructMessage(messageParams)

      const totalAmount = ethers.utils.parseEther("1.1");

      // Incorrect amount of ETH sent
      const reducedAmount = totalAmount.sub(1);
      await expect(dyve.connect(addr1).fulfillOrder(makerOrder, message, [], { value: reducedAmount }))
        .to.be.rejectedWith("InvalidMsgValue")

      // ETH sent to an ERC20 based transaction
      const ERC20Order = { ...makerOrder, currency: weth.address, orderType: ERC20_TO_ERC721 }
      await expect(dyve.connect(addr1).fulfillOrder(ERC20Order, message, [], { value: totalAmount }))
        .to.be.rejectedWith("InvalidMsgValue")

      // message id is invalid
      const invalidIdMessage = await constructMessage({ ...messageParams, tokenId: 1 })
      await expect(dyve.connect(addr1).fulfillOrder(makerOrder, invalidIdMessage, [], { value: totalAmount }))
        .to.be.rejectedWith("InvalidId")

      // message timestamp is invalid
      const invalidTimestampMessage = { ...message, timestamp: timestamp + 100 }
      await expect(dyve.connect(addr1).fulfillOrder(makerOrder, invalidTimestampMessage, [], { value: totalAmount }))
        .to.be.rejectedWith("InvalidTimestamp")

      // Invalid signature length
      const invalidSignatureLengthMessage = { ...message, signature: [] }
      await expect(dyve.connect(addr1).fulfillOrder(makerOrder, invalidSignatureLengthMessage, [], { value: totalAmount }))
        .to.be.rejectedWith("InvalidSignatureLength")

      // Invalid signature
      const invalidSignatureMessage = { ...message, signature: message.signature.slice(0, -2) + '00' }
      await expect(dyve.connect(addr1).fulfillOrder(makerOrder, invalidSignatureMessage, [], { value: totalAmount }))
        .to.be.rejectedWith("InvalidMessage")

      // Signer is the zero address
      const zeroAddressMaker = { ...makerOrder, signer: ethers.constants.AddressZero }
      await expect(dyve.connect(addr1).fulfillOrder(zeroAddressMaker, message, [], { value: totalAmount }))
        .to.be.rejectedWith("InvalidSigner")

      // listing has expired
      const expiredListingMaker = { ...makerOrder, endTime: data.startTime - 100 }
      await expect(dyve.connect(addr1).fulfillOrder(expiredListingMaker, message, [], { value: totalAmount }))
        .to.be.rejectedWith("ExpiredListing")

      // fee is zero
      const feeZeroMaker = { ...makerOrder, fee: ethers.utils.parseEther("0").toString() }
      await expect(dyve.connect(addr1).fulfillOrder(feeZeroMaker, message, [], { value: ethers.utils.parseEther("1") }))
        .to.be.rejectedWith("InvalidFee")

      // collateral is zero
      const collateralZeroMaker = { ...makerOrder, collateral: ethers.utils.parseEther("0").toString() }
      await expect(dyve.connect(addr1).fulfillOrder(collateralZeroMaker, message, [], { value: ethers.utils.parseEther("0.1") }))
        .to.be.rejectedWith("InvalidCollateral")

      // duration is zero
      const durationZeroMaker = { ...makerOrder, duration: 0 }
      await expect(dyve.connect(addr1).fulfillOrder(durationZeroMaker, message, [], { value: ethers.utils.parseEther("1.1") }))
        .to.be.rejectedWith("InvalidDuration")

      // amount is zero for ERC1155
      const amountZeroMaker = { ...makerOrder, orderType: ETH_TO_ERC1155, collection: mockERC1155.address, amount: 0 }
      const amountZeroMessage = await constructMessage({ ...messageParams, contract: mockERC1155.address })
      await expect(dyve.connect(addr1).fulfillOrder(amountZeroMaker, amountZeroMessage, [], { value: ethers.utils.parseEther("1.1") }))
        .to.be.rejectedWith("InvalidAmount")

      // amount is two for ERC721
      const amountTwoMaker = { ...makerOrder, amount: 2 }
      await expect(dyve.connect(addr1).fulfillOrder(amountTwoMaker, message, [], { value: ethers.utils.parseEther("1.1") }))
        .to.be.rejectedWith("InvalidAmount")

      // currency is not whitelisted
      const nonWhitelistedCurrencyMaker = { ...makerOrder, currency: ethers.constants.AddressZero, orderType: ERC20_TO_ERC721 }
      await expect(dyve.connect(addr1).fulfillOrder(nonWhitelistedCurrencyMaker, message, []))
        .to.be.rejectedWith("InvalidCurrency")

      // currency is not whitelisted
      const nonZeroAddressCurrencyMaker = { ...makerOrder, currency: mockUSDC.address }
      await expect(dyve.connect(addr1).fulfillOrder(nonZeroAddressCurrencyMaker, message, [], { value: totalAmount }))
        .to.be.rejectedWith("InvalidCurrency")

      // invalid signature
      const invalidSignatureMaker = { ...makerOrder, signature: ethers.utils.hexlify(ethers.utils.randomBytes(32)) }
      await expect(dyve.connect(addr1).fulfillOrder(invalidSignatureMaker, message, [], { value: totalAmount }))
        .to.be.rejectedWith("InvalidSignature")

      // token is flagged
      const flaggedMessage = await constructMessage({ ...messageParams, isFlagged: true})
      await expect(dyve.connect(addr1).fulfillOrder(makerOrder, flaggedMessage, [], { value: totalAmount }))
        .to.be.rejectedWith("TokenFlagged")
    })
  })

  describe("Premium collections functionality", function () { 
    it("consumes maker ask (listing ERC721) with taker bid using USDC and the maker owns an NFT from a premium collection with zero fees", async () => {
      const data = {
        orderType: ERC20_TO_ERC721,
        signer: owner.address,
        collection: mockERC721.address,
        tokenId: 0,
        amount: 1,
        duration: 10800,
        collateral: ethers.utils.parseEther("1").toString(),
        fee: ethers.utils.parseEther("0.1").toString(),
        currency: mockUSDC.address,
        nonce: 100,
        premiumCollection: premiumCollection.address,
        premiumTokenId: 0,
        startTime: Math.floor(Date.now() / 1000),
        endTime: Math.floor(Date.now() / 1000) + 86400,
      }

      const mintTx = await premiumCollection.mint();
      await mintTx.wait()

      const signature = await generateSignature(data, owner, dyve)
      const makerOrder = { ...data, signature }

      const { timestamp: fulfillOrderTimestamp } = await ethers.provider.getBlock('latest');
      const message = await constructMessage({ 
        contract: mockERC721.address,
        tokenId: 0,
        isFlagged: false,
        timestamp: fulfillOrderTimestamp - 10,
        signer: reservoirOracleSigner,
      })

      const addCurrencyTx = await whitelistedCurrencies.addWhitelistedCurrency(mockUSDC.address)
      await addCurrencyTx.wait()

      const borrowTx = await dyve.connect(addr1).fulfillOrder(makerOrder, message, [])
      await borrowTx.wait()

      await expect(mockERC721.ownerOf(1)).to.eventually.equal(addr1.address);
      await expect(mockUSDC.balanceOf(dyve.address)).to.eventually.equal(ethers.utils.parseEther("1"));
      await expect(mockUSDC.balanceOf(owner.address)).to.eventually.equal(ethers.utils.parseEther(String(30 + 0.1)));
      await expect(mockUSDC.balanceOf(addr1.address)).to.eventually.equal(ethers.utils.parseEther(String(30 - 1.1)));
      await expect(mockUSDC.balanceOf(protocolFeeRecipient.address)).to.eventually.equal(ethers.utils.parseEther("30"))
    })

   it("consumes maker ask (listing ERC721) with taker bid using ETH and the maker owns an NFT from a premium collection with zero fees", async () => {
      const data = {
        orderType: ETH_TO_ERC721,
        signer: owner.address,
        collection: mockERC721.address,
        tokenId: 0,
        amount: 1,
        duration: 10800,
        collateral: ethers.utils.parseEther("1").toString(),
        fee: ethers.utils.parseEther("0.1").toString(),
        currency: ethers.constants.AddressZero,
        nonce: 100,
        premiumCollection: premiumCollection.address,
        premiumTokenId: 0,
        startTime: Math.floor(Date.now() / 1000),
        endTime: Math.floor(Date.now() / 1000) + 86400,
      }

      const mintTx = await premiumCollection.mint();
      await mintTx.wait()

      const signature = await generateSignature(data, owner, dyve)
      const makerOrder = { ...data, signature }

      const { timestamp: fulfillOrderTimestamp } = await ethers.provider.getBlock('latest');
      const message = await constructMessage({ 
        contract: mockERC721.address,
        tokenId: 0,
        isFlagged: false,
        timestamp: fulfillOrderTimestamp - 10,
        signer: reservoirOracleSigner,
      })

      const borrowTx = await dyve.connect(addr1).fulfillOrder(makerOrder, message, [], { value: ethers.utils.parseEther("1.1").toString() })
      await borrowTx.wait()

      await expect(mockERC721.ownerOf(1)).to.eventually.equal(addr1.address);
      await expect(() => borrowTx).to.changeEtherBalance(dyve, ethers.utils.parseEther("1"));
      await expect(() => borrowTx).to.changeEtherBalance(owner, ethers.utils.parseEther("0.1"));
      await expect(() => borrowTx).to.changeEtherBalance(addr1, ethers.utils.parseEther("-1.1"));
      await expect(() => borrowTx).to.changeEtherBalance(protocolFeeRecipient, ethers.utils.parseEther("0"));
    })

    it("consumes maker ask (listing ERC721) with taker bid using ETH and the maker owns an NFT from a premium collection with non-zero fees", async () => {
      const data = {
        orderType: ETH_TO_ERC721,
        signer: owner.address,
        collection: mockERC721.address,
        tokenId: 0,
        amount: 1,
        duration: 10800,
        collateral: ethers.utils.parseEther("1").toString(),
        fee: ethers.utils.parseEther("0.1").toString(),
        currency: ethers.constants.AddressZero,
        nonce: 100,
        premiumCollection: premiumCollection.address,
        premiumTokenId: 0,
        startTime: Math.floor(Date.now() / 1000),
        endTime: Math.floor(Date.now() / 1000) + 86400,
      }

      const mintTx = await premiumCollection.mint();
      await mintTx.wait()

      const addPremiumCollectionTx = await protocolFeeManager.updateCollectionFeeRate(premiumCollection.address, 100)
      await addPremiumCollectionTx.wait()

      const signature = await generateSignature(data, owner, dyve)
      const makerOrder = { ...data, signature }

      const { timestamp: fulfillOrderTimestamp } = await ethers.provider.getBlock('latest');
      const message = await constructMessage({ 
        contract: mockERC721.address,
        tokenId: 0,
        isFlagged: false,
        timestamp: fulfillOrderTimestamp - 10,
        signer: reservoirOracleSigner,
      })

      const borrowTx = await dyve.connect(addr1).fulfillOrder(makerOrder, message, [], { value: ethers.utils.parseEther("1.1").toString() })
      await borrowTx.wait()

      await expect(mockERC721.ownerOf(1)).to.eventually.equal(addr1.address);
      await expect(() => borrowTx).to.changeEtherBalance(dyve, ethers.utils.parseEther("1"));
      await expect(() => borrowTx).to.changeEtherBalance(owner, ethers.utils.parseEther(String(0.1 * 0.99)));
      await expect(() => borrowTx).to.changeEtherBalance(addr1, ethers.utils.parseEther("-1.1"));
      await expect(() => borrowTx).to.changeEtherBalance(protocolFeeRecipient, ethers.utils.parseEther(String(0.1 * 0.01)));
    })

    it("consumes maker ask (listing ERC721) with taker bid using USDC and the maker owns an NFT from a premium collection with non-zero fees", async () => {
      const data = {
        orderType: ERC20_TO_ERC721,
        signer: owner.address,
        collection: mockERC721.address,
        tokenId: 0,
        amount: 1,
        duration: 10800,
        collateral: ethers.utils.parseEther("1").toString(),
        fee: ethers.utils.parseEther("0.1").toString(),
        currency: mockUSDC.address,
        nonce: 100,
        premiumCollection: premiumCollection.address,
        premiumTokenId: 0,
        startTime: Math.floor(Date.now() / 1000),
        endTime: Math.floor(Date.now() / 1000) + 86400,
      }

      const mintTx = await premiumCollection.mint();
      await mintTx.wait()

      const addPremiumCollectionTx = await protocolFeeManager.updateCollectionFeeRate(premiumCollection.address, 100)
      await addPremiumCollectionTx.wait()

      const signature = await generateSignature(data, owner, dyve)
      const makerOrder = { ...data, signature }

      const { timestamp: fulfillOrderTimestamp } = await ethers.provider.getBlock('latest');
      const message = await constructMessage({ 
        contract: mockERC721.address,
        tokenId: 0,
        isFlagged: false,
        timestamp: fulfillOrderTimestamp - 10,
        signer: reservoirOracleSigner,
      })

      const addCurrencyTx = await whitelistedCurrencies.addWhitelistedCurrency(mockUSDC.address)
      await addCurrencyTx.wait()

      const borrowTx = await dyve.connect(addr1).fulfillOrder(makerOrder, message, [])
      await borrowTx.wait()

      await expect(mockERC721.ownerOf(1)).to.eventually.equal(addr1.address);
      await expect(mockUSDC.balanceOf(dyve.address)).to.eventually.equal(ethers.utils.parseEther("1"));
      await expect(mockUSDC.balanceOf(owner.address)).to.eventually.equal(ethers.utils.parseEther(String(30 + (0.1 * 0.99))));
      await expect(mockUSDC.balanceOf(addr1.address)).to.eventually.equal(ethers.utils.parseEther(String(30 - 1.1)));
      await expect(mockUSDC.balanceOf(protocolFeeRecipient.address)).to.eventually.equal(ethers.utils.parseEther(String(30 + (0.1 * 0.01))));
    })


    it("consumes maker ask (listing ERC721) with taker bid using USDC and the maker uses a non premium collection in the premium collection maker field", async () => {
      const data = {
        orderType: ERC20_TO_ERC721,
        signer: owner.address,
        collection: mockERC721.address,
        tokenId: 0,
        amount: 1,
        duration: 10800,
        collateral: ethers.utils.parseEther("1").toString(),
        fee: ethers.utils.parseEther("0.1").toString(),
        currency: mockUSDC.address,
        nonce: 100,
        premiumCollection: mockERC721.address,
        premiumTokenId: 0,
        startTime: Math.floor(Date.now() / 1000),
        endTime: Math.floor(Date.now() / 1000) + 86400,
      }

      const mintTx = await premiumCollection.mint();
      await mintTx.wait()

      const addPremiumCollectionTx = await protocolFeeManager.updateCollectionFeeRate(premiumCollection.address, 100)
      await addPremiumCollectionTx.wait()

      const signature = await generateSignature(data, owner, dyve)
      const makerOrder = { ...data, signature }

      const { timestamp: fulfillOrderTimestamp } = await ethers.provider.getBlock('latest');
      const message = await constructMessage({ 
        contract: mockERC721.address,
        tokenId: 0,
        isFlagged: false,
        timestamp: fulfillOrderTimestamp - 10,
        signer: reservoirOracleSigner,
      })

      const addCurrencyTx = await whitelistedCurrencies.addWhitelistedCurrency(mockUSDC.address)
      await addCurrencyTx.wait()

      const borrowTx = await dyve.connect(addr1).fulfillOrder(makerOrder, message, [])
      await borrowTx.wait()

      await expect(mockERC721.ownerOf(1)).to.eventually.equal(addr1.address);
      await expect(mockUSDC.balanceOf(dyve.address)).to.eventually.equal(ethers.utils.parseEther("1"));
      await expect(mockUSDC.balanceOf(owner.address)).to.eventually.equal(ethers.utils.parseEther(String(30 + 0.1)));
      await expect(mockUSDC.balanceOf(addr1.address)).to.eventually.equal(ethers.utils.parseEther(String(30 - 1.1)));
      await expect(mockUSDC.balanceOf(protocolFeeRecipient.address)).to.eventually.equal(ethers.utils.parseEther("30"));
    })


    it("consumes maker ask (listing ERC721) with taker bid using USDC and the maker uses a premium collection, but does not own the specified token in the maker order", async () => {
      const data = {
        orderType: ERC20_TO_ERC721,
        signer: owner.address,
        collection: mockERC721.address,
        tokenId: 0,
        amount: 1,
        duration: 10800,
        collateral: ethers.utils.parseEther("1").toString(),
        fee: ethers.utils.parseEther("0.1").toString(),
        currency: mockUSDC.address,
        nonce: 100,
        premiumCollection: premiumCollection.address,
        premiumTokenId: 0,
        startTime: Math.floor(Date.now() / 1000),
        endTime: Math.floor(Date.now() / 1000) + 86400,
      }

      const mintTx = await premiumCollection.connect(addr1).mint();
      await mintTx.wait()

      const addPremiumCollectionTx = await protocolFeeManager.updateCollectionFeeRate(premiumCollection.address, 100)
      await addPremiumCollectionTx.wait()

      const signature = await generateSignature(data, owner, dyve)
      const makerOrder = { ...data, signature }

      const { timestamp: fulfillOrderTimestamp } = await ethers.provider.getBlock('latest');
      const message = await constructMessage({ 
        contract: mockERC721.address,
        tokenId: 0,
        isFlagged: false,
        timestamp: fulfillOrderTimestamp - 10,
        signer: reservoirOracleSigner,
      })

      const addCurrencyTx = await whitelistedCurrencies.addWhitelistedCurrency(mockUSDC.address)
      await addCurrencyTx.wait()

      const borrowTx = await dyve.connect(addr1).fulfillOrder(makerOrder, message, [])
      await borrowTx.wait()

      await expect(mockERC721.ownerOf(1)).to.eventually.equal(addr1.address);
      await expect(mockUSDC.balanceOf(dyve.address)).to.eventually.equal(ethers.utils.parseEther("1"));
      await expect(mockUSDC.balanceOf(owner.address)).to.eventually.equal(ethers.utils.parseEther(String(30 + 0.1)));
      await expect(mockUSDC.balanceOf(addr1.address)).to.eventually.equal(ethers.utils.parseEther(String(30 - 1.1)));
      await expect(mockUSDC.balanceOf(protocolFeeRecipient.address)).to.eventually.equal(ethers.utils.parseEther("30"));
    })
  })

  describe("Closing position functionality", function () {
    it("consumes Maker Bid ERC721 (with ETH) Listing then closes the position", async () => {
        const data = {
          orderType: ETH_TO_ERC721,
          signer: owner.address,
          collection: mockERC721.address,
          tokenId: 0,
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
        }

        const signature = await generateSignature(data, owner, dyve)
        const makerOrder = { ...data, signature }

        const { timestamp: fulfillOrderTimestamp } = await ethers.provider.getBlock('latest');
        const fulfillOrderMessage = await constructMessage({ 
          contract: mockERC721.address,
          tokenId: 0,
          isFlagged: false,
          timestamp: fulfillOrderTimestamp - 10,
          signer: reservoirOracleSigner,
        })

        const totalAmount = ethers.utils.parseEther("1.1").toString();
        const borrowTx = await dyve.connect(addr1).fulfillOrder(makerOrder, fulfillOrderMessage, [], { value: totalAmount })
        await borrowTx.wait();

        const { timestamp } = await ethers.provider.getBlock(borrowTx.blockNumber);
        const message = await constructMessage({ 
          contract: mockERC721.address,
          tokenId: 1,
          isFlagged: false,
          timestamp: timestamp - 10,
          signer: reservoirOracleSigner,
        })

        const order = generateOrder(data, owner.address, addr1.address, timestamp + data.duration)
        const closeTx = await dyve.connect(addr1).closePosition(order, 1, message);
        const orderHash = computeOrderHash(data, owner.address, addr1.address, timestamp + data.duration)
        await closeTx.wait();

        const orderStatus = await dyve.orders(orderHash)

        expect(orderStatus).to.equal(CLOSED);
        await expect(() => closeTx).to.changeEtherBalance(dyve, ethers.utils.parseEther("-1"));
        await expect(() => closeTx).to.changeEtherBalance(addr1, ethers.utils.parseEther("1"));

        await expect(mockERC721.ownerOf(1)).to.eventually.equal(owner.address);

        await expect(closeTx)
        .to.emit(dyve, "Close")
        .withArgs(orderHash, 1)
      })

      it("consumes Maker Bid ERC1155 (with ETH) Listing then closes the position", async () => {
        const data = {
          orderType: ETH_TO_ERC1155,
          signer: owner.address,
          collection: mockERC1155.address,
          tokenId: 0,
          amount: 10,
          duration: 10800,
          collateral: ethers.utils.parseEther("1").toString(),
          fee: ethers.utils.parseEther("0.1").toString(),
          currency: ethers.constants.AddressZero,
          nonce: 100,
          premiumCollection: ethers.constants.AddressZero,
          premiumTokenId: 0,
          startTime: Math.floor(Date.now() / 1000),
          endTime: Math.floor(Date.now() / 1000) + 86400,
        }

        const signature = await generateSignature(data, owner, dyve)
        const makerOrder = { ...data, signature }

        const { timestamp: fulfillOrderTimestamp } = await ethers.provider.getBlock('latest');
        const fulfillOrderMessage = await constructMessage({ 
          contract: mockERC1155.address,
          tokenId: 0,
          isFlagged: false,
          timestamp: fulfillOrderTimestamp - 10,
          signer: reservoirOracleSigner,
        })

        const totalAmount = ethers.utils.parseEther("1.1").toString();
        const borrowTx = await dyve.connect(addr1).fulfillOrder(makerOrder, fulfillOrderMessage, [], { value: totalAmount })
        await borrowTx.wait();

        const { timestamp } = await ethers.provider.getBlock(borrowTx.blockNumber);
        const message = await constructMessage({ 
          contract: mockERC1155.address, 
          tokenId: 1,
          isFlagged: false,
          timestamp: timestamp - 10, 
          signer: reservoirOracleSigner 
        })

        const order = generateOrder(data, owner.address, addr1.address, timestamp + data.duration)
        const closeTx = await dyve.connect(addr1).closePosition(order, 1, message);
        const orderHash = computeOrderHash(data, owner.address, addr1.address, timestamp + data.duration)
        await closeTx.wait();

        const orderStatus = await dyve.orders(orderHash)

        expect(orderStatus).to.equal(CLOSED);
        await expect(() => closeTx).to.changeEtherBalance(dyve, ethers.utils.parseEther("-1"));
        await expect(() => closeTx).to.changeEtherBalance(addr1, ethers.utils.parseEther("1"));

        await expect(mockERC1155.balanceOf(owner.address, 1)).to.eventually.equal(10);

        await expect(closeTx)
        .to.emit(dyve, "Close")
        .withArgs(orderHash, 1)
      })

      it("consumes Maker Bid ERC721 (with USDC) Listing then closes the position", async () => {
        const data = {
          orderType: ERC20_TO_ERC721,
          signer: owner.address,
          collection: mockERC721.address,
          tokenId: 0,
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
        }

        const signature = await generateSignature(data, owner, dyve)
        const makerOrder = { ...data, signature }

        const { timestamp: fulfillOrderTimestamp } = await ethers.provider.getBlock('latest');
        const fulfillOrderMessage = await constructMessage({ 
          contract: mockERC721.address,
          tokenId: 0,
          isFlagged: false,
          timestamp: fulfillOrderTimestamp - 10,
          signer: reservoirOracleSigner,
        })

        const whitelistTx = await whitelistedCurrencies.addWhitelistedCurrency(mockUSDC.address)
        await whitelistTx.wait();

        const borrowTx = await dyve.connect(addr1).fulfillOrder(makerOrder, fulfillOrderMessage, [])
        await borrowTx.wait();

        const { timestamp } = await ethers.provider.getBlock(borrowTx.blockNumber);
        const message = await constructMessage({ 
          contract: mockERC721.address,
          tokenId: data.tokenId,
          isFlagged: false,
          timestamp: timestamp - 10,
          signer: reservoirOracleSigner
        })

        const order = generateOrder(data, owner.address, addr1.address, timestamp + data.duration)
        const closeTx = await dyve.connect(addr1).closePosition(order, data.tokenId, message);
        const orderHash = computeOrderHash(data, owner.address, addr1.address, timestamp + data.duration)
        await closeTx.wait();

        const orderStatus = await dyve.orders(orderHash)

        expect(orderStatus).to.equal(CLOSED);
        await expect(mockUSDC.balanceOf(dyve.address)).to.eventually.eq(ethers.utils.parseEther("0"));
        await expect(mockUSDC.balanceOf(addr1.address)).to.eventually.eq(ethers.utils.parseEther(String(30 - 0.1)));

        await expect(mockERC721.ownerOf(0)).to.eventually.equal(owner.address);

        await expect(closeTx)
        .to.emit(dyve, "Close")
        .withArgs(orderHash, data.tokenId)
      })

      it("consumes Maker Bid ERC1155 (with USDC) Listing then closes the position", async () => {
        const data = {
          orderType: ERC20_TO_ERC1155,
          signer: owner.address,
          collection: mockERC1155.address,
          tokenId: 0,
          amount: 10,
          duration: 10800,
          collateral: ethers.utils.parseEther("1").toString(),
          fee: ethers.utils.parseEther("0.1").toString(),
          currency: mockUSDC.address,
          nonce: 100,
          premiumCollection: ethers.constants.AddressZero,
          premiumTokenId: 0,
          startTime: Math.floor(Date.now() / 1000),
          endTime: Math.floor(Date.now() / 1000) + 86400,
        }

        const signature = await generateSignature(data, owner, dyve)
        const makerOrder = { ...data, signature }

        const { timestamp: fulfillOrderTimestamp } = await ethers.provider.getBlock('latest');
        const fulfillOrderMessage = await constructMessage({ 
          contract: mockERC1155.address,
          tokenId: 0,
          isFlagged: false,
          timestamp: fulfillOrderTimestamp - 10,
          signer: reservoirOracleSigner,
        })

        const whitelistTx = await whitelistedCurrencies.addWhitelistedCurrency(mockUSDC.address)
        await whitelistTx.wait();

        const borrowTx = await dyve.connect(addr1).fulfillOrder(makerOrder, fulfillOrderMessage, [])
        await borrowTx.wait();

        const { timestamp } = await ethers.provider.getBlock(borrowTx.blockNumber);
        const message = await constructMessage({ 
          contract: mockERC1155.address,
          tokenId: data.tokenId,
          isFlagged: false,
          timestamp: timestamp - 10,
          signer: reservoirOracleSigner
        })

        const order = generateOrder(data, owner.address, addr1.address, timestamp + data.duration)
        const closeTx = await dyve.connect(addr1).closePosition(order, data.tokenId, message);
        const orderHash = computeOrderHash(data, owner.address, addr1.address, timestamp + data.duration)
        await closeTx.wait();

        const orderStatus = await dyve.orders(orderHash)

        expect(orderStatus).to.equal(CLOSED);
        await expect(mockUSDC.balanceOf(dyve.address)).to.eventually.eq(ethers.utils.parseEther("0"));
        await expect(mockUSDC.balanceOf(addr1.address)).to.eventually.eq(ethers.utils.parseEther(String(30 - 0.1)));

        await expect(mockERC1155.balanceOf(owner.address, 0)).to.eventually.equal(10);

        await expect(closeTx)
        .to.emit(dyve, "Close")
        .withArgs(orderHash, data.tokenId)
      })

      it("checks validation for closePosition", async () => {
        const data = {
          orderType: ETH_TO_ERC721,
          signer: owner.address,
          collection: mockERC721.address,
          tokenId: 0,
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
        }

        const signature = await generateSignature(data, owner, dyve)
        const makerOrder = { ...data, signature }

        const { timestamp: fulfillOrderTimestamp } = await ethers.provider.getBlock('latest');
        const fulfillOrderMessage = await constructMessage({ 
          contract: mockERC721.address,
          tokenId: 0,
          isFlagged: false,
          timestamp: fulfillOrderTimestamp - 10,
          signer: reservoirOracleSigner,
        })

        const totalAmount = ethers.utils.parseEther("1.1").toString();
        const borrowTx = await dyve.connect(addr1).fulfillOrder(makerOrder, fulfillOrderMessage, [], { value: totalAmount })
        await borrowTx.wait();

        const { timestamp } = await ethers.provider.getBlock(borrowTx.blockNumber);
        const messageParams = {
          contract: mockERC721.address,
          tokenId: data.tokenId,
          isFlagged: false,
          timestamp: timestamp - 10,
          signer: reservoirOracleSigner
        } 
        const nonFlaggedMessage = await constructMessage(messageParams)

        const order = generateOrder(data, owner.address, addr1.address, timestamp + data.duration)

        // Borrower is not msg.sender
        await expect(dyve.closePosition(order, data.tokenId, nonFlaggedMessage))
          .to.be.revertedWithCustomError(dyve, "InvalidSender")
          .withArgs(owner.address)

        // Order is expired
        await expect(dyve.closePosition(order, data.tokenId, nonFlaggedMessage))
          .to.be.revertedWithCustomError(dyve, "InvalidSender")
          .withArgs(owner.address)

        // Borrower does not own the ERC721
        await expect(dyve.connect(addr1).closePosition(order, 2, nonFlaggedMessage))
          .to.be.rejectedWith("NotTokenOwner")

        // message id is invalid
        await expect(dyve.connect(addr1).closePosition(order, 1, nonFlaggedMessage))
          .to.be.rejectedWith("InvalidId")

        // message timestamp is invalid
        const invalidTimestampMessage = { ...nonFlaggedMessage, timestamp: timestamp + 100 }
        await expect(dyve.connect(addr1).closePosition(order, data.tokenId, invalidTimestampMessage))
          .to.be.rejectedWith("InvalidTimestamp")

        // Invalid signature length
        const invalidSignatureLengthMessage = { ...nonFlaggedMessage, signature: [] }
        await expect(dyve.connect(addr1).closePosition(order, data.tokenId, invalidSignatureLengthMessage))
          .to.be.rejectedWith("InvalidSignatureLength")

        // Invalid signature
        const invalidSignatureMessage = { ...nonFlaggedMessage, signature: nonFlaggedMessage.signature.slice(0, -2) + '00' }
        await expect(dyve.connect(addr1).closePosition(order, data.tokenId, invalidSignatureMessage))
          .to.be.rejectedWith("InvalidMessage")

        const closeTx = await dyve.connect(addr1).closePosition(order, data.tokenId, nonFlaggedMessage);
        await closeTx.wait();

        // Order is not active
        await expect(dyve.connect(addr1).closePosition(order, data.tokenId, nonFlaggedMessage))
          .to.be.rejectedWith("InvalidOrderStatus")

        // token is flagged
        const flaggedData = { ...data, signature, nonce: 101 } 
        const flaggedSignature = await generateSignature(flaggedData, owner, dyve)
        const flaggedMakerOrder = { ...flaggedData, signature: flaggedSignature }

        const flaggedBorrowTx = await dyve.connect(addr1).fulfillOrder(flaggedMakerOrder, fulfillOrderMessage, [], { value: totalAmount })
        await flaggedBorrowTx.wait();

        const { timestamp: flaggedTimestamp } = await ethers.provider.getBlock(flaggedBorrowTx.blockNumber);
        const flaggedMessage = await constructMessage({ 
          contract: mockERC721.address,
          tokenId: 1,
          isFlagged: true,
          timestamp: flaggedTimestamp - 10,
          signer: reservoirOracleSigner
        })

        const flaggedOrder = generateOrder(flaggedData, owner.address, addr1.address, flaggedTimestamp + flaggedData.duration)

        // Borrower does not own the ERC721
        await expect(dyve.connect(addr1).closePosition(flaggedOrder, 1, flaggedMessage))
          .to.be.rejectedWith("TokenFlagged")
      })
  })

  describe("Claim collateral functionality", function () {
    it("consumes Maker Bid Listing (using ETH) then the lender claims the collateral", async () => {
      const data = {
        orderType: ETH_TO_ERC721,
        signer: owner.address,
        collection: mockERC721.address,
        tokenId: 0,
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
      }

      const signature = await generateSignature(data, owner, dyve)
      const makerOrder = { ...data, signature }

      const { timestamp: fulfillOrderTimestamp } = await ethers.provider.getBlock('latest');
      const message = await constructMessage({ 
        contract: mockERC721.address,
        tokenId: 0,
        isFlagged: false,
        timestamp: fulfillOrderTimestamp - 10,
        signer: reservoirOracleSigner,
      })

      const borrowTx = await dyve.connect(addr1).fulfillOrder(makerOrder, message, [], { value: ethers.utils.parseEther("1.1") })
      await borrowTx.wait();

      const { timestamp } = await ethers.provider.getBlock(borrowTx.blockNumber)
      await ethers.provider.send("evm_mine", [timestamp + 110]);

      const order = generateOrder(data, owner.address, addr1.address, timestamp + data.duration);
      const orderHash = computeOrderHash(data, owner.address, addr1.address, timestamp + data.duration)
      const claimTx = await dyve.claimCollateral(order);
      await claimTx.wait();

      const orderStatus = await dyve.orders(orderHash);

      expect(orderStatus).to.equal(EXPIRED);
      await expect(() => claimTx).to.changeEtherBalance(owner, ethers.utils.parseEther("1"));
      await expect(() => claimTx).to.changeEtherBalance(dyve, ethers.utils.parseEther("-1"));

      await expect(claimTx)
      .to.emit(dyve, "Claim")
      .withArgs(orderHash);
    })
  
    it("consumes Maker Bid Listing (using USDC) then the lender claims the collateral", async () => {
      const data = {
        orderType: ERC20_TO_ERC721,
        signer: owner.address,
        collection: mockERC721.address,
        tokenId: 0,
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
      }

      const signature = await generateSignature(data, owner, dyve)
      const makerOrder = { ...data, signature }

      const { timestamp: fulfillOrderTimestamp } = await ethers.provider.getBlock('latest');
      const message = await constructMessage({ 
        contract: mockERC721.address,
        tokenId: 0,
        isFlagged: false,
        timestamp: fulfillOrderTimestamp - 10,
        signer: reservoirOracleSigner,
      })

      const whitelistTx = await whitelistedCurrencies.addWhitelistedCurrency(mockUSDC.address)
      await whitelistTx.wait()

      const borrowTx = await dyve.connect(addr1).fulfillOrder(makerOrder, message, [])
      await borrowTx.wait();

      const { timestamp } = await ethers.provider.getBlock(borrowTx.blockNumber)
      await ethers.provider.send("evm_mine", [timestamp + 110]);

      const order = generateOrder(data, owner.address, addr1.address, timestamp + data.duration);
      const orderHash = computeOrderHash(data, owner.address, addr1.address, timestamp + data.duration)
      const claimTx = await dyve.claimCollateral(order);
      await claimTx.wait();

      const orderStatus = await dyve.orders(orderHash);

      // 30 ETH + 1 ETH - 0.1 ETH
      // 30 = originally balance
      // 1 = collateral
      // 0.1 = final lender fee after protocol fee cut
      expect(orderStatus).to.equal(EXPIRED);
      await expect(mockUSDC.balanceOf(owner.address)).to.eventually.equal(ethers.utils.parseEther(String(30 + 0.1 + 1)))
      await expect(mockUSDC.balanceOf(dyve.address)).to.eventually.equal(ethers.utils.parseEther("0"))

      await expect(claimTx)
      .to.emit(dyve, "Claim")
      .withArgs(orderHash)
    })


    it("checks validation for claimCollateral", async () => {
      const data = {
        orderType: ETH_TO_ERC721,
        signer: owner.address,
        collection: mockERC721.address,
        tokenId: 0,
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
      }

      const signature = await generateSignature(data, owner, dyve)
      const makerOrder = { ...data, signature }

      const { timestamp: fulfillOrderTimestamp } = await ethers.provider.getBlock('latest');
      const message = await constructMessage({ 
        contract: mockERC721.address,
        tokenId: 0,
        isFlagged: false,
        timestamp: fulfillOrderTimestamp - 10,
        signer: reservoirOracleSigner,
      })

      const totalAmount = ethers.utils.parseEther("1.1").toString();
      const borrowTx = await dyve.connect(addr1).fulfillOrder(makerOrder, message, [], { value: totalAmount })
      await borrowTx.wait();

      const { timestamp } = await ethers.provider.getBlock(borrowTx.blockNumber)

      const order = generateOrder(data, owner.address, addr1.address, timestamp + data.duration);

      // lender is not msg.sender
      await expect(dyve.connect(addr1).claimCollateral(order))   
        .to.be.revertedWithCustomError(dyve, "InvalidSender")
        .withArgs(addr1.address)
      
      // Order is not expired
      await expect(dyve.claimCollateral(order))   
        .to.be.rejectedWith("InvalidOrderExpiration")

      // Order is not borrowed
      await ethers.provider.send("evm_mine", [timestamp + 110]);
      const claimTx = await dyve.claimCollateral(order)
      await claimTx.wait()

      await expect(dyve.claimCollateral(order))   
        .to.be.rejectedWith("InvalidOrderStatus")
    })
  })

  describe("Cancel order functionality", function () {
    it("cancels all orders for user then fails to list order with old nonce", async () => {
      const cancelTx = await dyve.cancelAllOrdersForSender(120);
      await cancelTx.wait()

      const data = {
        orderType: ETH_TO_ERC721,
        signer: owner.address,
        collection: mockERC721.address,
        tokenId: 0,
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
      }

      const signature = await generateSignature(data, owner, dyve)
      const makerOrder = { ...data, signature }

      const { timestamp: fulfillOrderTimestamp } = await ethers.provider.getBlock('latest');
      const message = await constructMessage({ 
        contract: mockERC721.address,
        tokenId: 0,
        isFlagged: false,
        timestamp: fulfillOrderTimestamp - 10,
        signer: reservoirOracleSigner,
      })

      const totalAmount = ethers.utils.parseEther("1.1").toString();
      await expect(dyve.connect(addr1).fulfillOrder(makerOrder, message, [], { value: totalAmount }))
        .to.be.rejectedWith("ExpiredNonce")

      await expect(cancelTx)
      .to.emit(dyve, "CancelAllOrders")
      .withArgs(owner.address, 120)
    })

    it("checks validation for cancelAllOrdersForSender", async () => {
      const cancelTx = await dyve.cancelAllOrdersForSender(120);
      await cancelTx.wait()

      await expect(dyve.cancelAllOrdersForSender(100))
        .to.be.rejectedWith("InvalidMinNonce")
      await expect(dyve.cancelAllOrdersForSender(500121))
        .to.be.rejectedWith("InvalidMinNonce")
    })

    it("cancels an order and then fails to list the same order", async () => {
      const cancelTx = await dyve.cancelMultipleMakerOrders([100]);
      await cancelTx.wait()

      const data = {
        orderType: ETH_TO_ERC721,
        signer: owner.address,
        collection: mockERC721.address,
        tokenId: 0,
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
      }

      const signature = await generateSignature(data, owner, dyve)
      const makerOrder = { ...data, signature }

      const { timestamp: fulfillOrderTimestamp } = await ethers.provider.getBlock('latest');
      const message = await constructMessage({ 
        contract: mockERC721.address,
        tokenId: 0,
        isFlagged: false,
        timestamp: fulfillOrderTimestamp - 10,
        signer: reservoirOracleSigner,
      })

      const totalAmount = ethers.utils.parseEther("1.1").toString();
      await expect(dyve.connect(addr1).fulfillOrder(makerOrder, message, [], { value: totalAmount }))
        .to.be.rejectedWith("ExpiredNonce")

      await expect(cancelTx)
      .to.emit(dyve, "CancelMultipleOrders")
      .withArgs(owner.address, [100])
    })

    it("checks validation for cancelMultipleMakerOrders", async () => {
      const cancelAllTx = await dyve.cancelAllOrdersForSender(120);
      await cancelAllTx.wait()

      await expect(dyve.cancelMultipleMakerOrders([]))
        .to.be.rejectedWith("EmptyNonceArray")
      await expect(dyve.cancelMultipleMakerOrders([100]))
        .to.be.revertedWithCustomError(dyve, "InvalidNonce")
        .withArgs(100)
    })
  })

  describe("Protocol Fee Manager Contract functionality", function () {
    it("adds, adjusts and removes mockERC721 as a premium collection", async () => {
      const addPremiumCollectionTx = await protocolFeeManager.updateCollectionFeeRate(mockERC721.address, 1)
      await addPremiumCollectionTx.wait()

      await expect(protocolFeeManager.determineProtocolFeeRate(mockERC721.address, 0, owner.address)).to.be.eventually.equal(0)
      await expect(addPremiumCollectionTx).to.emit(protocolFeeManager, "UpdatedCollectionFeeRate").withArgs(mockERC721.address, 1)

      const removePremiumCollectionTx = await protocolFeeManager.updateCollectionFeeRate(mockERC721.address, 0)
      await removePremiumCollectionTx.wait()

      await expect(protocolFeeManager.determineProtocolFeeRate(mockERC721.address, 0, owner.address)).to.be.eventually.equal(0)
      await expect(removePremiumCollectionTx).to.emit(protocolFeeManager, "UpdatedCollectionFeeRate").withArgs(mockERC721.address, 0)
    })

    it("sets mockERC721 to a non-zero rate", async () => {
      const updatePremiumCollectionTx = await protocolFeeManager.updateCollectionFeeRate(mockERC721.address, 100)
      await updatePremiumCollectionTx.wait()

      await expect(protocolFeeManager.determineProtocolFeeRate(mockERC721.address, 0, owner.address)).to.be.eventually.equal(100)
      await expect(updatePremiumCollectionTx).to.emit(protocolFeeManager, "UpdatedCollectionFeeRate").withArgs(mockERC721.address, 100)
    })

    it("updates the protocol fee", async () => {
      const updateProtocolFeeTx = await protocolFeeManager.updateProtocolFeeRate(100)
      await updateProtocolFeeTx.wait()

      await expect(protocolFeeManager.determineProtocolFeeRate(ethers.constants.AddressZero, 0, owner.address)).to.be.eventually.equal(100)
      await expect(updateProtocolFeeTx).to.emit(protocolFeeManager, "UpdatedProtocolFeeRate").withArgs(100)
    })

    it("updates the ProtocolFeeManager in the Dyve contract", async () => {
      const tx = await dyve.updateProtocolFeeManager(ethers.constants.AddressZero)
      await tx.wait()

      await expect(tx).to.emit(dyve, "ProtocolFeeManagerUpdated").withArgs(ethers.constants.AddressZero)
    })

    it("attempts to input an invalid protocol fee rate", async () => {
      await expect(protocolFeeManager.updateProtocolFeeRate(10001)).to.be.rejectedWith("InvalidProtocolFeeRate")
    })
  })  

  describe("Whitelisted Currencies Contract functionality", function () {
    it("adds and removes USDC as a whitelisted currency", async () => {
      const addWhitelistTx = await whitelistedCurrencies.addWhitelistedCurrency(mockUSDC.address) 
      await addWhitelistTx.wait()

      await expect(whitelistedCurrencies.isCurrencyWhitelisted(mockUSDC.address)).to.be.eventually.true
      await expect(addWhitelistTx).to.emit(whitelistedCurrencies, "AddCurrencyToWhitelist").withArgs(mockUSDC.address)

      const removeWhitelistTx = await whitelistedCurrencies.removeWhitelistedCurrency(mockUSDC.address) 
      await removeWhitelistTx.wait()

      await expect(whitelistedCurrencies.isCurrencyWhitelisted(mockUSDC.address)).to.be.eventually.false
      await expect(removeWhitelistTx).to.emit(whitelistedCurrencies, "RemoveCurrencyFromWhitelist").withArgs(mockUSDC.address)
    })

    it("updates the WhitelistedCurrencies Contract functionality", async () => {
      const tx = await dyve.updateWhitelistedCurrencies(ethers.constants.AddressZero)
      await tx.wait()

      await expect(tx).to.emit(dyve, "WhitelistedCurrenciesUpdated").withArgs(ethers.constants.AddressZero)
    })
  })

  describe("Reservoir Oracle Contract functionality", function () {
    it("updates the reservoir oracle address signer", async () => {
      const tx = await reservoirOracle.updateReservoirOracleAddress(owner.address) 
      await tx.wait()

      await expect(reservoirOracle.reservoirOracleAddress()).to.eventually.equal(owner.address)
    })

    it("checks validation for the reservoir oracle contract", async () => {
      const ReservoirOracle = await ethers.getContractFactory("ReservoirOracle");
      await expect(ReservoirOracle.deploy(ethers.constants.AddressZero)).to.be.rejectedWith("InvalidReservoirOracleAddress")
      await expect(reservoirOracle.updateReservoirOracleAddress(ethers.constants.AddressZero)).to.be.rejectedWith("InvalidReservoirOracleAddress")
    })

    it("updates the ReservoirOracle Contract functionality", async () => {
      const tx = await dyve.updateReservoirOracle(ethers.constants.AddressZero)
      await tx.wait()

      await expect(tx).to.emit(dyve, "ReservoirOracleUpdated").withArgs(ethers.constants.AddressZero)
    })
  })

  describe("Protocol Fee Recipient functionality", function () {
    it("updates the ProtocolFeeManager in the Dyve contract", async () => {
      const tx = await dyve.updateProtocolFeeRecipient(ethers.constants.AddressZero)
      await tx.wait()

      await expect(tx).to.emit(dyve, "ProtocolFeeRecipientUpdated").withArgs(ethers.constants.AddressZero)
    })
  })
})