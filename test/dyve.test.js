const { expect, use } = require("chai")
const { ethers } = require("hardhat")
const types = require("../utils/types")
use(require('chai-as-promised'))

const { keccak256, defaultAbiCoder } = ethers.utils;

function range(size, startAt = 0) {
  return [...Array(size).keys()].map(i => i + startAt);
}

let accounts;
let owner;
let addr1;
let addr2;
let addrs;
let protocolFeeRecipient;
let escrow;
let dyve;
let lender;

const generateSignature = async (data, signer, contract) => {
  const domain = {
    name: "Dyve",
    version: "1",
    chainId: "31337",
    verifyingContract: contract.address
  }
  const signature = (await signer._signTypedData(domain, types, data)).substring(2)

  const r = "0x" + signature.slice(0, 64)
  const s = "0x" + signature.slice(64, 128)
  const v = parseInt(signature.slice(128, 130), 16)

  return { v, r, s }
}

beforeEach(async function () {
  accounts = await ethers.getSigners(); 
  [owner, addr1, addr2, ...addrs] = accounts;

  const ProtocolFeeRecipient = await ethers.getContractFactory("ProtocolFeeRecipient");
  protocolFeeRecipient = await ProtocolFeeRecipient.deploy();
  await protocolFeeRecipient.deployed();

  const Escrow = await ethers.getContractFactory("Escrow");
  escrow = await Escrow.deploy();
  await escrow.deployed();

  const Dyve = await ethers.getContractFactory("Dyve");
  dyve = await Dyve.deploy(escrow.address, protocolFeeRecipient.address);

  const Lender = await ethers.getContractFactory("LenderNft");
  lender = await Lender.deploy();

  const mintTx = await lender.mint();
  await mintTx.wait()
});

const computeOrderHash = (order) => {
  const types = [
    "bytes32",
    "bool",
    "address",
    "address",
    "uint256",
    "uint256",
    "uint256",
    "uint256",
    "uint256",
    "uint256",
  ]

  const values = [
    "0xfbfa4cc51bd328a406baa169f7be8d728dd273ef5990252068e9d9446ce23a46",
    order.isOrderAsk,
    order.signer,
    order.collection,
    order.tokenId,
    order.duration,
    order.collateral,
    order.fee,
    order.startTime,
    order.endTime,
  ]

  return keccak256(defaultAbiCoder.encode(types, values));
}

describe("Dyve", function () {
  it("consumes Maker Ask Listing", async () => {
    const data = {
      isOrderAsk: true,
      signer: owner.address,
      collection: lender.address,
      tokenId: 1,
      duration: 10800,
      collateral: ethers.utils.parseEther("1").toString(),
      fee: ethers.utils.parseEther("0.1").toString(),
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

    const approveTx = await lender.setApprovalForAll(dyve.address, true);
    await approveTx.wait();

    const totalAmount = ethers.utils.parseEther(String(1 + (0.1 * 1.02))).toString();
    const borrowTx = await dyve.connect(addr1).matchAskWithTakerBid(takerOrder, makerOrder, { value: totalAmount })
    await borrowTx.wait()

    const makerOrderHash = computeOrderHash(data)
    const order = await dyve.orders(makerOrderHash)

    const { timestamp } = await ethers.provider.getBlock(borrowTx.blockNumber)

    expect(lender.ownerOf(1)).to.eventually.equal(addr1.address);
    await expect(() => borrowTx).to.changeEtherBalance(escrow, ethers.utils.parseEther("1"))
    await expect(() => borrowTx).to.changeEtherBalance(owner, ethers.utils.parseEther("0.1"))
    await expect(() => borrowTx).to.changeEtherBalance(addr1, `-${totalAmount}`);
    await expect(() => borrowTx).to.changeEtherBalance(protocolFeeRecipient, ethers.utils.parseEther(String(0.1 * 0.02)));

    expect(order.orderHash).to.equal(order.orderHash);
    expect(order.lender).to.equal(data.signer);
    expect(order.borrower).to.equal(takerOrder.taker);
    expect(order.collection).to.equal(data.collection);
    expect(order.tokenId).to.equal(data.tokenId);
    expect(order.expiryDateTime).to.equal(timestamp + data.duration);
    expect(order.collateral).to.equal(data.collateral);
    expect(order.status).to.equal(0);

    expect(borrowTx)
    .to.emit(dyve, "TakerBid")
    .withArgs(
      order.orderHash,
      order.borrower,
      order.lender,
      order.collection,
      order.tokenId,
      order.collateral,
      data.fee,
      order.expiryDateTime,
      order.status,
    )
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

    const lenderApproveTx = await lender.setApprovalForAll(dyve.address, true);
    await lenderApproveTx.wait();

    const totalAmount = ethers.utils.parseEther(String(1 + (0.1 * 1.02))).toString();
    const borrowTx = await dyve.connect(addr1).matchAskWithTakerBid(takerOrder, makerOrder, { value: totalAmount })
    await borrowTx.wait();

    const borrowerApproveTx = await lender.connect(addr1).setApprovalForAll(dyve.address, true);
    await borrowerApproveTx.wait();

    const makerOrderHash = computeOrderHash(data);
    const closeTx = await dyve.connect(addr1).closePosition(makerOrderHash, data.tokenId);
    await closeTx.wait();

    const order = await dyve.orders(makerOrderHash)

    expect(lender.ownerOf(1)).to.eventually.equal(owner.address);
    await expect(() => closeTx).to.changeEtherBalance(escrow, ethers.utils.parseEther("-1"))
    await expect(() => closeTx).to.changeEtherBalance(addr1, ethers.utils.parseEther("1"))

    expect(order.status).to.equal(2);

    expect(closeTx)
    .to.emit(dyve, "Close")
    .withArgs(
      order.orderHash,
      order.borrower,
      order.lender,
      order.collection,
      order.tokenId,
      1,
      order.collateral,
      order.status,
    )
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

    const lenderApproveTx = await lender.setApprovalForAll(dyve.address, true);
    await lenderApproveTx.wait();

    const totalAmount = ethers.utils.parseEther(String(1 + (0.1 * 1.02))).toString();
    const borrowTx = await dyve.connect(addr1).matchAskWithTakerBid(takerOrder, makerOrder, { value: totalAmount })
    await borrowTx.wait();

    const { timestamp } = await ethers.provider.getBlock(borrowTx.blockNumber)
    await ethers.provider.send("evm_mine", [timestamp + 10800]);

    const makerOrderHash = computeOrderHash(data);
    const claimTx = await dyve.claimCollateral(makerOrderHash);
    await claimTx.wait();

    const order = await dyve.orders(makerOrderHash);

    await expect(() => claimTx).to.changeEtherBalance(escrow, ethers.utils.parseEther("-1"))
    await expect(() => claimTx).to.changeEtherBalance(owner, ethers.utils.parseEther("1"))
    expect(order.status).to.equal(1);

    expect(claimTx)
    .to.emit(dyve, "Close")
    .withArgs(
      order.orderHash,
      order.borrower,
      order.lender,
      order.collection,
      order.tokenId,
      1,
      order.collateral,
      order.status,
    )
  })
})
