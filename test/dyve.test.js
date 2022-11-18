const { expect, use } = require("chai")
const { ethers } = require("hardhat")
const types = require("../utils/types")
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
  protocolFeeRecipient = addr2;

  const Dyve = await ethers.getContractFactory("Dyve");
  dyve = await Dyve.deploy(protocolFeeRecipient.address);

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
    "uint256",
  ]

  const values = [
    "0xdc2ec73446e2f2be13384f113009c234f3c341a7706ebec11889644c41ad74d3",
    order.isOrderAsk,
    order.signer,
    order.collection,
    order.tokenId,
    order.duration,
    order.collateral,
    order.fee,
    order.nonce,
    order.startTime,
    order.endTime,
  ]

  return keccak256(defaultAbiCoder.encode(types, values));
}

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

  it("consumes maker ask (listing) with taker bid", async () => {
    const data = {
      isOrderAsk: true,
      signer: owner.address,
      collection: lender.address,
      tokenId: 1,
      duration: 10800,
      collateral: ethers.utils.parseEther("1").toString(),
      fee: ethers.utils.parseEther("0.1").toString(),
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

    const approveTx = await lender.setApprovalForAll(dyve.address, true);
    await approveTx.wait();

    const totalAmount = ethers.utils.parseEther(String(1 + (0.1 * 1.02))).toString();
    const borrowTx = await dyve.connect(addr1).matchAskWithTakerBid(takerOrder, makerOrder, { value: totalAmount })
    await borrowTx.wait()

    const makerOrderHash = computeOrderHash(data)
    const order = await dyve.orders(makerOrderHash)

    const { timestamp } = await ethers.provider.getBlock(borrowTx.blockNumber)

    expect(lender.ownerOf(1)).to.eventually.equal(addr1.address);
    await expect(() => borrowTx).to.changeEtherBalance(dyve, ethers.utils.parseEther("1"))
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
      data.duration,
      order.expiryDateTime,
      order.status,
    )

    await expect(dyve.connect(addr1).matchAskWithTakerBid(takerOrder, makerOrder, { value: totalAmount }))
      .to.be.rejectedWith("Order: Matching order listing expired")
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

    const approveTx = await lender.setApprovalForAll(dyve.address, true);
    await approveTx.wait();

    // insufficient funds
    const totalAmount = ethers.utils.parseEther(String(1 + (0.1 * 1.02)))
    const insufficientAmount = totalAmount.sub(1);
    await expect(dyve.connect(addr1).matchAskWithTakerBid(takerOrder, makerOrder, { value: insufficientAmount }))
      .to.be.rejectedWith("Order: Insufficient amount sent to Dyve")

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

    // invalid signature
    const invalidSignatureMaker = { ...makerOrder, signature: ethers.utils.formatBytes32String("0x123") }
    await expect(dyve.connect(addr1).matchAskWithTakerBid(takerOrder, invalidSignatureMaker, { value: totalAmount }))
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
    await expect(() => closeTx).to.changeEtherBalance(dyve, ethers.utils.parseEther("-1"))
    await expect(() => closeTx).to.changeEtherBalance(addr1, ethers.utils.parseEther("1"))

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

    const lenderApproveTx = await lender.setApprovalForAll(dyve.address, true);
    await lenderApproveTx.wait();

    const totalAmount = ethers.utils.parseEther(String(1 + (0.1 * 1.02))).toString();
    const borrowTx = await dyve.connect(addr1).matchAskWithTakerBid(takerOrder, makerOrder, { value: totalAmount })
    await borrowTx.wait();

    const borrowerApproveTx = await lender.connect(addr1).setApprovalForAll(dyve.address, true);
    await borrowerApproveTx.wait();

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

    await expect(() => claimTx).to.changeEtherBalance(dyve, ethers.utils.parseEther("-1"))
    await expect(() => claimTx).to.changeEtherBalance(owner, ethers.utils.parseEther("1"))
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

    const lenderApproveTx = await lender.setApprovalForAll(dyve.address, true);
    await lenderApproveTx.wait();

    const totalAmount = ethers.utils.parseEther(String(1 + (0.1 * 1.02))).toString();
    const borrowTx = await dyve.connect(addr1).matchAskWithTakerBid(takerOrder, makerOrder, { value: totalAmount })
    await borrowTx.wait();

    const makerOrderHash = computeOrderHash(data);
    // const claimTx = await dyve.claimCollateral(makerOrderHash);
    // await claimTx.wait();

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

    const lenderApproveTx = await lender.setApprovalForAll(dyve.address, true);
    await lenderApproveTx.wait();

    const totalAmount = ethers.utils.parseEther(String(1 + (0.1 * 1.02))).toString();
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

    const lenderApproveTx = await lender.setApprovalForAll(dyve.address, true);
    await lenderApproveTx.wait();

    const totalAmount = ethers.utils.parseEther(String(1 + (0.1 * 1.02))).toString();
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
