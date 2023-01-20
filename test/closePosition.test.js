const { expect, use } = require("chai")
const { ethers } = require("hardhat")
const axios = require('axios')
const { setup, tokenSetup, generateSignature, computeOrderHash } = require("./helpers")
use(require('chai-as-promised'))

const ETH_TO_ERC721 = 0
const ETH_TO_ERC1155 = 1
const ERC20_TO_ERC721 = 2
const ERC20_TO_ERC1155 = 3
const ERC721_TO_ERC20 = 4
const ERC1155_TO_ERC20 = 5

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

  [lender, weth, mockUSDC, mockERC721, mockERC1155, whitelistedCurrencies, premiumCollections, dyve] = await setup(protocolFeeRecipient)
  await tokenSetup([owner, addr1, addr2], weth, mockUSDC, lender, mockERC721, mockERC1155, whitelistedCurrencies, premiumCollections, dyve)
});

// isolating test suite due to difference in timestamp received from API and the block.timestamp
// API timestamp gives accurate time
// block.timestamp seems to be moving faster in hardhat test
describe("Dyve closing positions", function () {
 it("consumes Maker Bid ERC721 (with ETH) Listing then closes the position", async () => {
    const options = {
      method: 'GET',
      url: 'https://api.reservoir.tools/oracle/tokens/status/v1?tokens=0x59468516a8259058baD1cA5F8f4BFF190d30E066%3A9',
      headers: {accept: '*/*', 'x-api-key': 'dyve-api-key'}
    };
    const { messages: [{ message }] } = (await axios.request(options)).data

    const data = {
      orderType: ETH_TO_ERC721,
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
      tokenFlaggingId: message.id,
    }

    const signature = await generateSignature(data, owner, dyve)
    const makerOrder = { ...data, signature }

    const totalAmount = ethers.utils.parseEther("1.1").toString();
    const borrowTx = await dyve.connect(addr1).fulfillOrder(makerOrder, { value: totalAmount })
    await borrowTx.wait();

    // const { timestamp } = await ethers.provider.getBlock(borrowTx.blockNumber);
    // await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 10]); 
    // await network.provider.send("evm_mine");

    const makerOrderHash = computeOrderHash(data);
    const closeTx = await dyve.connect(addr1).closePosition(makerOrderHash, data.tokenId, message);
    await closeTx.wait();

    const order = await dyve.orders(makerOrderHash)

    await expect(() => closeTx).to.changeEtherBalance(dyve, ethers.utils.parseEther("-1"));
    await expect(() => closeTx).to.changeEtherBalance(addr1, ethers.utils.parseEther("1"));

    await expect(lender.ownerOf(1)).to.eventually.equal(owner.address);
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
      order.amount,
      1,
      order.collateral,
      order.currency,
      order.status,
    )
  })

  it("consumes Maker Bid ERC1155 (with ETH) Listing then closes the position", async () => {
    const options = {
      method: 'GET',
      url: 'https://api.reservoir.tools/oracle/tokens/status/v1?tokens=0x59468516a8259058baD1cA5F8f4BFF190d30E066%3A9',
      headers: {accept: '*/*', 'x-api-key': 'dyve-api-key'}
    };
    const { messages: [{ message }] } = (await axios.request(options)).data

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
      tokenFlaggingId: message.id,
    }

    const signature = await generateSignature(data, owner, dyve)
    const makerOrder = { ...data, signature }

    const totalAmount = ethers.utils.parseEther("1.1").toString();
    const borrowTx = await dyve.connect(addr1).fulfillOrder(makerOrder, { value: totalAmount })
    await borrowTx.wait();

    const makerOrderHash = computeOrderHash(data);
    const closeTx = await dyve.connect(addr1).closePosition(makerOrderHash, data.tokenId, message);
    await closeTx.wait();

    const order = await dyve.orders(makerOrderHash)

    await expect(() => closeTx).to.changeEtherBalance(dyve, ethers.utils.parseEther("-1"));
    await expect(() => closeTx).to.changeEtherBalance(addr1, ethers.utils.parseEther("1"));

    await expect(mockERC1155.balanceOf(owner.address, 0)).to.eventually.equal(10);
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
      order.amount,
      0,
      order.collateral,
      order.currency,
      order.status,
    )
  })

  it("consumes Maker Bid ERC721 (with USDC) Listing then closes the position", async () => {
    const options = {
      method: 'GET',
      url: 'https://api.reservoir.tools/oracle/tokens/status/v1?tokens=0x59468516a8259058baD1cA5F8f4BFF190d30E066%3A9',
      headers: {accept: '*/*', 'x-api-key': 'dyve-api-key'}
    };
    const { messages: [{ message }] } = (await axios.request(options)).data

    const data = {
      orderType: ERC20_TO_ERC721,
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
      tokenFlaggingId: message.id,
    }

    const signature = await generateSignature(data, owner, dyve)
    const makerOrder = { ...data, signature }

    const whitelistTx = await whitelistedCurrencies.addWhitelistedCurrency(mockUSDC.address)
    await whitelistTx.wait();

    const borrowTx = await dyve.connect(addr1).fulfillOrder(makerOrder)
    await borrowTx.wait();

    // const { timestamp } = await ethers.provider.getBlock(borrowTx.blockNumber);
    // await network.provider.send("evm_setNextBlockTimestamp", [timestamp + 10]); 
    // await network.provider.send("evm_mine");

    const makerOrderHash = computeOrderHash(data);
    const closeTx = await dyve.connect(addr1).closePosition(makerOrderHash, data.tokenId, message);
    await closeTx.wait();

    const order = await dyve.orders(makerOrderHash)

    await expect(mockUSDC.balanceOf(dyve.address)).to.eventually.eq(ethers.utils.parseEther("0"));
    await expect(mockUSDC.balanceOf(addr1.address)).to.eventually.eq(ethers.utils.parseEther(String(30 - 0.1)));

    await expect(lender.ownerOf(1)).to.eventually.equal(owner.address);
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
      order.amount,
      1,
      order.collateral,
      order.currency,
      order.status,
    )
  })

  it("consumes Maker Bid ERC1155 (with USDC) Listing then closes the position", async () => {
    const options = {
      method: 'GET',
      url: 'https://api.reservoir.tools/oracle/tokens/status/v1?tokens=0x59468516a8259058baD1cA5F8f4BFF190d30E066%3A9',
      headers: {accept: '*/*', 'x-api-key': 'dyve-api-key'}
    };
    const { messages: [{ message }] } = (await axios.request(options)).data

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
      tokenFlaggingId: message.id,
    }

    const signature = await generateSignature(data, owner, dyve)
    const makerOrder = { ...data, signature }

    const whitelistTx = await whitelistedCurrencies.addWhitelistedCurrency(mockUSDC.address)
    await whitelistTx.wait();

    const borrowTx = await dyve.connect(addr1).fulfillOrder(makerOrder)
    await borrowTx.wait();

    const makerOrderHash = computeOrderHash(data);
    const closeTx = await dyve.connect(addr1).closePosition(makerOrderHash, data.tokenId, message);
    await closeTx.wait();

    const order = await dyve.orders(makerOrderHash)

    await expect(mockUSDC.balanceOf(dyve.address)).to.eventually.eq(ethers.utils.parseEther("0"));
    await expect(mockUSDC.balanceOf(addr1.address)).to.eventually.eq(ethers.utils.parseEther(String(30 - 0.1)));

    await expect(mockERC1155.balanceOf(owner.address, 0)).to.eventually.equal(10);
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
      order.amount,
      0,
      order.collateral,
      order.currency,
      order.status,
    )
  })

  it("checks validation for closePosition", async () => {
    const nonFlaggedTokenOptions = {
      method: 'GET',
      url: 'https://api.reservoir.tools/oracle/tokens/status/v1?tokens=0x59468516a8259058baD1cA5F8f4BFF190d30E066%3A9',
      headers: {accept: '*/*', 'x-api-key': 'dyve-api-key'}
    };
    const { messages: [{ message: nonFlaggedMessage }] } = (await axios.request(nonFlaggedTokenOptions)).data

    const data = {
      orderType: ETH_TO_ERC721,
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
      tokenFlaggingId: nonFlaggedMessage.id,
    }

    const signature = await generateSignature(data, owner, dyve)
    const makerOrder = { ...data, signature }

    const totalAmount = ethers.utils.parseEther("1.1").toString();
    const borrowTx = await dyve.connect(addr1).fulfillOrder(makerOrder, { value: totalAmount })
    await borrowTx.wait();

    const makerOrderHash = computeOrderHash(data);

    // Borrower is not msg.sender
    await expect(dyve.closePosition(makerOrderHash, data.tokenId, nonFlaggedMessage))
      .to.be.rejectedWith("Order: Borrower must be the sender")

    // token flagging id does not match message id
    const wrongTokenFlaggingIdMessage = { ...nonFlaggedMessage, id: ethers.constants.HashZero }
    await expect(dyve.connect(addr1).closePosition(makerOrderHash, data.tokenId, wrongTokenFlaggingIdMessage))
      .to.be.rejectedWith("InvalidId")

    // message timestamp is invalid
    const { timestamp: nonFlaggedTimestamp } = await ethers.provider.getBlock(borrowTx.blockNumber)
    const wrongTimestampMessage = { ...nonFlaggedMessage, timestamp: nonFlaggedTimestamp + 100 }
    await expect(dyve.connect(addr1).closePosition(makerOrderHash, data.tokenId, wrongTimestampMessage))
      .to.be.rejectedWith("InvalidTimestamp")

    // message timestamp is too old
    const pastTimestampMessage = { ...nonFlaggedMessage, timestamp: nonFlaggedMessage.timestamp - 310 }
    await expect(dyve.connect(addr1).closePosition(makerOrderHash, data.tokenId, pastTimestampMessage))
      .to.be.rejectedWith("InvalidTimestamp")

    // signature length is incorrect
    const wrongSignatureMessage = { ...nonFlaggedMessage, signature: [] }
    await expect(dyve.connect(addr1).closePosition(makerOrderHash, data.tokenId, wrongSignatureMessage))
      .to.be.rejectedWith("InvalidSignature")

    // signature is invalid
    const invalidSignatureMaker = { ...nonFlaggedMessage, signature: nonFlaggedMessage.signature.slice(0, -2) + "00" }
    await expect(dyve.connect(addr1).closePosition(makerOrderHash, data.tokenId, invalidSignatureMaker))
      .to.be.rejectedWith("InvalidMessage")

    // Borrower does not own the ERC721
    await expect(dyve.connect(addr1).closePosition(makerOrderHash, 3, nonFlaggedMessage))
      .to.be.rejectedWith("Order: Borrower does not own the returning ERC721 token")

    const closeTx = await dyve.connect(addr1).closePosition(makerOrderHash, data.tokenId, nonFlaggedMessage);
    await closeTx.wait();

    // Order is not active
    await expect(dyve.connect(addr1).closePosition(makerOrderHash, data.tokenId, nonFlaggedMessage))
      .to.be.rejectedWith("Order: Order is not borrowed")

    // token is flagged
    const flaggedTokenOptions = {
      method: 'GET',
      url: 'https://api.reservoir.tools/oracle/tokens/status/v1?tokens=0x7fda36c8daedcc55b73e964c2831d6161ef60a75%3A8149',
      headers: {accept: '*/*', 'x-api-key': 'dyve-api-key'}
    };;
    const { messages: [{ message: flaggedMessage }] } = (await axios.request(flaggedTokenOptions)).data

    const flaggedData = { ...data, signature, nonce: 101, tokenFlaggingId: flaggedMessage.id } 
    const flaggedSignature = await generateSignature(flaggedData, owner, dyve)
    const flaggedTokenIdMakerOrder = { ...flaggedData, signature: flaggedSignature }

    const flaggedBorrowTx = await dyve.connect(addr1).fulfillOrder(flaggedTokenIdMakerOrder, { value: totalAmount })
    await flaggedBorrowTx.wait();

    const flaggedMakerOrderHash = computeOrderHash(flaggedData);

    // Borrower does not own the ERC721
    await expect(dyve.connect(addr1).closePosition(flaggedMakerOrderHash, data.tokenId, flaggedMessage))
      .to.be.rejectedWith("Order: Cannot return a flagged NFT");
  })
})