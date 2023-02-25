const { ethers } = require("hardhat");
const { setup, tokenSetup, generateSignature, computeOrderHash, constructMessage } = require("../../test/helpers")
const s = require('./setup.json')
const pool = require('./pg');

async function main() {
  const [owner] = await ethers.getSigners();
  const Dyve = await ethers.getContractFactory('Dyve')
  const dyve = await Dyve.attach(s.dyve.address)
  await dyve.deployed()

  const { rows: [dbOrder] } = await pool.query(
    `select * from "Orderbook" where signer = $1 ORDER BY nonce DESC LIMIT 1`,
    [owner.address]
  )

  const startTime = new Date()
  const endTime = new Date(startTime.getTime() + 86400000)
  const data = {
    orderType: s.ETH_TO_ERC721,
    signer: owner.address,
    collection: s.mockERC721.address,
    tokenId: (dbOrder?.tokenId ?? 0) + 1,
    amount: 1,
    duration: 10800,
    collateral: ethers.utils.parseEther("1").toString(),
    fee: ethers.utils.parseEther("0.1").toString(),
    currency: ethers.constants.AddressZero,
    nonce: (dbOrder?.nonce ?? 0) + 1,
    premiumCollection: ethers.constants.AddressZero,
    premiumTokenId: 0,
    startTime: Math.floor(startTime.getTime() / 1000),
    endTime: Math.floor(endTime.getTime() / 1000),
  }
  const signature = await generateSignature(data, owner, dyve)

  const order = { 
    ...data,
    signature,
    orderHash: computeOrderHash(data),
    status: 'LISTED',
    tokenType: 'erc721',
    orderType: 'ETH_TO_ERC721',
    startTime: startTime.toISOString(),
    endTime: endTime.toISOString(),
  }

  await pool.query(
    `INSERT INTO "Orderbook"("orderHash", "orderType", signer, collection, "tokenId", amount, duration, collateral, fee, currency, status, nonce, "startTime", "endTime", "tokenType", "signature") values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
    [order.orderHash, order.orderType, order.signer, order.collection, order.tokenId, order.amount, order.duration, order.collateral, order.fee, order.currency, order.status, order.nonce, order.startTime, order.endTime, order.tokenType, signature],
  )

  console.log("created listing")
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});