const { ethers } = require("hardhat");
const { setup, tokenSetup, generateSignature, computeOrderHash, constructMessage, snakeToCamel, toSqlDateTime } = require("../../test/helpers")
const s = require('./setup.json')
const pool = require('./mysql');

async function main() {
  const [owner] = await ethers.getSigners();
  const Dyve = await ethers.getContractFactory('Dyve')
  const dyve = await Dyve.attach(s.dyve.address)
  await dyve.deployed()

  let dbOrder
  [[dbOrder]] = await pool.query(
    `select * from orderbook where signer = ? ORDER BY nonce DESC LIMIT 1`,
    [owner.address]
  )
  dbOrder = snakeToCamel(dbOrder)

  const startTime = new Date()
  const endTime = new Date(startTime.getTime() + 86400000)
  const data = {
    orderType: s.ETH_TO_ERC721,
    signer: owner.address,
    collection: s.mockERC721.address,
    tokenId: dbOrder?.tokenId ? Number(dbOrder.tokenId.toString()) + 1 : 1,
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

  console.log("end time iso string: ", endTime.toISOString())
  console.log("end time mysql: ", endTime.toISOString().slice(0, 19).replace('T', ' '))
  console.log("=====================================")
  console.log("end time seconds solidity: ", Math.floor(endTime.getTime() / 1000))

  const order = { 
    ...data,
    signature,
    orderHash: computeOrderHash(data),
    status: 'LISTED',
    tokenType: 'erc721',
    orderType: 'ETH_TO_ERC721',
    startTime: toSqlDateTime(startTime),
    endTime: toSqlDateTime(endTime),
    floorPrice: ethers.utils.parseEther("1").toString(),
  }

  await pool.query(
    `INSERT INTO orderbook(order_hash, order_type, signer, collection, token_id, amount, duration, collateral, fee, currency, status, nonce, start_time, end_time, token_type, signature, floor_price) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [order.orderHash, order.orderType, order.signer, order.collection, order.tokenId, order.amount, order.duration, order.collateral, order.fee, order.currency, order.status, order.nonce, order.startTime, order.endTime, order.tokenType, signature, order.floorPrice],
  )

  console.log("created listing")
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});