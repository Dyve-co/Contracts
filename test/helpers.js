const { ethers } = require('hardhat')
const { constants } = require('ethers')
const { orderType, messageType } = require("./types")
const { solidityKeccak256, keccak256, defaultAbiCoder, parseEther, _TypedDataEncoder, arrayify } = ethers.utils;

const orderTypeMapping = {
  ETH_TO_ERC721: 0,
  ETH_TO_ERC1155: 1,
  ERC20_TO_ERC721: 2,
  ERC20_TO_ERC1155: 3,
  ERC721_TO_ERC20: 4,
  ERC1155_TO_ERC20: 5,
} 

const setup = async (protocolFeeRecipient, reservoirOracleSigner) => {
  const WETH = await ethers.getContractFactory("WETH");
  const weth = await WETH.deploy();
  await weth.deployed();

  const MockUSDC = await ethers.getContractFactory("MockERC20");
  const mockUSDC = await MockUSDC.deploy("USDC", "USDC");
  await mockUSDC.deployed();

  const MockERC721 = await ethers.getContractFactory("MockERC721");
  const mockERC721 = await MockERC721.deploy("mockERC721", "mockERC721", "URI");
  await mockERC721.deployed();

  const MockERC1155 = await ethers.getContractFactory("MockERC1155");
  const mockERC1155 = await MockERC1155.deploy("mockERC1155", "mockERC1155", "URI");
  await mockERC1155.deployed();

  const PremiumCollection = await ethers.getContractFactory("MockERC721");
  const premiumCollection = await PremiumCollection.deploy("premiumCollection", "premiumCollection", "URI");
  await premiumCollection.deployed();

  const WhitelistedCurrencies = await ethers.getContractFactory("WhitelistedCurrencies");
  const whitelistedCurrencies = await WhitelistedCurrencies.deploy();
  await whitelistedCurrencies.deployed();

  const ProtocolFeeManager = await ethers.getContractFactory("ProtocolFeeManager");
  const protocolFeeManager = await ProtocolFeeManager.deploy(0);
  await protocolFeeManager.deployed();

  const ReservoirOracle = await ethers.getContractFactory("ReservoirOracle");
  const reservoirOracle = await ReservoirOracle.deploy(reservoirOracleSigner.address);
  await reservoirOracle.deployed();

  const Dyve = await ethers.getContractFactory("Dyve");
  const dyve = await Dyve.deploy(whitelistedCurrencies.address, protocolFeeManager.address, reservoirOracle.address, protocolFeeRecipient.address);
  await dyve.deployed();

  return [weth, mockUSDC, mockERC721, mockERC1155, premiumCollection, whitelistedCurrencies, reservoirOracle, protocolFeeManager, dyve];
} 

const tokenSetup = async (users, weth, mockERC20, mockERC721, mockERC1155, premiumCollection, whitelistedCurrencies, protocolFeeManager, dyve) => {
  await Promise.all(users.map(async(user, index) => {
  // let index = 0
  // for (user of users) {
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

    // Set approval for all tokens in lender collection
    await mockERC721.connect(user).setApprovalForAll(dyve.address, true);

    // Each user mints 10 ERC1155 NFT
    await mockERC1155.connect(user).mint(index, 10);

    // Set approval for all tokens in mockERC1155 collection
    await mockERC1155.connect(user).setApprovalForAll(dyve.address, true);

    // Add WETH to currency whitelist
    await whitelistedCurrencies.addWhitelistedCurrency(weth.address);

    // Add premium mock ERC721 to collection whitelist
    await protocolFeeManager.updateCollectionFeeRate(premiumCollection.address, 1);

    // index++
  }))
}

const generateSignature = async (data, signer, contract) => {
  const domain = {
    name: "Dyve",
    version: "1",
    chainId: "31337",
    verifyingContract: contract.address
  }
  const orderTypeData = {
    orderType: data.orderType, 
    signer: data.signer, 
    collection: data.collection, 
    tokenId: data.tokenId, 
    amount: data.amount,
    duration: data.duration, 
    collateral: data.collateral, 
    fee: data.fee, 
    currency: data.currency, 
    nonce: data.nonce, 
    endTime: data.endTime, 
  }
  const signature = await signer._signTypedData(domain, orderType, orderTypeData)

  return signature
}

const generateOracleSignature = async (data, signer) => {
  const domain = {
    name: "Oracle",
    version: "1",
    chainId: "31337",
  }

  const signature = await signer._signTypedData(domain, messageType, data)

  return signature
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
    "uint256",
    "address",
    "uint256",
    "uint256",
  ]

  const values = [
    "0xaad599fc66ff6b968ccb16010214cc3102e0a7e009000f61cab3f208682c3088",
    order.orderType,
    order.signer,
    order.collection,
    order.tokenId,
    order.amount,
    order.duration,
    order.collateral,
    order.fee,
    order.currency,
    order.nonce,
    order.endTime,
  ]

  return keccak256(defaultAbiCoder.encode(types, values));
}

const constructMessage = async ({ contract, tokenId, isFlagged, timestamp, signer }) => {
  const tokenType = {
    Token: [
      { name: "contract", type: "address" },
      { name: "tokenId", type: "uint256" },
    ],
  }
  const id = _TypedDataEncoder.hashStruct("Token", tokenType, {
    contract,
    tokenId, 
  });
  const payload = defaultAbiCoder.encode(['bool', 'uint256'], [isFlagged, 100])

  const messageHash = solidityKeccak256(
    ["bytes32", "bytes32", "bytes", "uint256"],
    [
      solidityKeccak256(['string'], ["Message(bytes32 id,bytes payload,uint256 timestamp)"]),
      id,
      solidityKeccak256(['bytes'], [payload]),
      timestamp,
    ]
  )
  const messageHashBinary = arrayify(messageHash)
  const signature = await signer.signMessage(messageHashBinary)
  const message = { id, payload, timestamp, signature }

  return message
}

const generateOrder = (input) => {
  const order = {
    orderType: orderTypeMapping[input.orderType],
    signer: input.signer,
    collection: input.collection,
    tokenId: input.tokenId,
    amount: input.amount,
    duration: input.duration,
    collateral: input.collateral,
    fee: input.fee,
    currency: input.currency,
    premiumCollection: input.premiumCollection,
    premiumTokenId: input.premiumTokenId,
    nonce: input.nonce,
    endTime: Math.floor(input.endTime.getTime() / 1000),
    signature: input.signature,
  }

  return order
}

const snakeToCamel = input => Object.keys(input ?? {}).reduce((acc, key) => ({
  ...acc,
  [key.toLowerCase().replace(/([-_][a-z])/g, group =>
    group
      .toUpperCase()
      .replace('-', '')
      .replace('_', '')
  )]: input[key],
}), {})

// TODO: This shouldn't work. It only works in this node env cause of some weird timezone offset thing
// leave it be, but use the code with caution
const toSqlDateTime = (date) => {
  const dateWithOffset = new Date(date.getTime() - (date.getTimezoneOffset() * 60000))
  return dateWithOffset
    .toISOString()
    .slice(0, 19)
    .replace('T', ' ')
}

module.exports = {
  setup,
  tokenSetup,
  generateSignature,
  generateOrder,
  generateOracleSignature,
  computeOrderHash,
  constructMessage,
  snakeToCamel,
  toSqlDateTime,
}