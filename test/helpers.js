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
  const dyve = await Dyve.deploy(protocolFeeRecipient.address);
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

  // const r = "0x" + signature.slice(0, 64)
  // const s = "0x" + signature.slice(64, 128)
  // const v = parseInt(signature.slice(128, 130), 16)

  return "0x" + signature
}

const computeOrderHash = (order) => {
  const types = [
    "bytes32",
    "uint256",
    "address",
    "address",
    "uint256",
    "uint256",
    "uint256",
    "uint256",
    "address",
    "uint256",
  ]

  const values = [
    "0xc74a4fd22fe479a9c093c0292447e36aa545fdb509945a0bea84d6c6a626c680",
    order.orderType,
    order.signer,
    order.collection,
    order.tokenId,
    order.duration,
    order.collateral,
    order.fee,
    order.currency,
    order.nonce,
  ]

  return keccak256(defaultAbiCoder.encode(types, values));
}

module.exports = {
  setup,
  tokenSetup,
  generateSignature,
  computeOrderHash,
}
