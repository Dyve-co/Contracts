const { ethers } = require('hardhat')
const { constants } = require('ethers')
const types = require("../utils/types")
const { keccak256, defaultAbiCoder, parseEther } = ethers.utils;

const setup = async (protocolFeeRecipient) => {
  const Lender = await ethers.getContractFactory("LenderNft");
  const lender = await Lender.deploy();
  await lender.deployed();

  const WETH = await ethers.getContractFactory("WETH");
  const weth = await WETH.deploy();
  await weth.deployed();

  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const mockUSDC = await MockERC20.deploy("USDC", "USDC");
  await mockUSDC.deployed();

  const Dyve = await ethers.getContractFactory("Dyve");
  const dyve = await Dyve.deploy(weth.address, protocolFeeRecipient.address);
  await dyve.deployed();

  return [lender, weth, mockUSDC, dyve];
} 

const tokenSetup = async (users, weth, mockERC20, mockERC721, dyve) => {
  for (const user of users) {
    // Each user gets 30 WETH
    await weth.connect(user).deposit({ value: parseEther("30") });

    // Set approval for WETH
    await weth.connect(user).approve(dyve.address, constants.MaxUint256);

    // Each user gets 30 mockERC20
    await mockERC20.connect(user).mint(user.address, parseEther("30"));

    // Set approval for mockERC20
    await mockERC20.connect(user).approve(dyve.address, constants.MaxUint256);

    // Each user mints 1 ERC721 NFT
    await mockERC721.connect(user).mint();

    // Set approval for all tokens in mock collection to transferManager contract for ERC721
    await mockERC721.connect(user).setApprovalForAll(dyve.address, true);

    // Add WETH to currency whitelist
    await dyve.addWhitelistedCurrency(weth.address);
  }
}

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
    "address",
    "uint256",
    "uint256",
    "uint256",
  ]

  const values = [
    "0x9458fb7fdd96a965c8bdbb8fb8cc611e387f3f63b805c214d55ea06b1d31ea88",
    order.isOrderAsk,
    order.signer,
    order.collection,
    order.tokenId,
    order.duration,
    order.collateral,
    order.fee,
    order.currency,
    order.nonce,
    order.startTime,
    order.endTime,
  ]

  return keccak256(defaultAbiCoder.encode(types, values));
}

module.exports = {
  setup,
  tokenSetup,
  generateSignature,
  computeOrderHash,
}