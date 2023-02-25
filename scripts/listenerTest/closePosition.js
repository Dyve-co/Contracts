const { ethers } = require("hardhat");
const { setup, tokenSetup, generateOrder, generateSignature, computeOrderHash, constructMessage } = require("../../test/helpers")
const s = require('./setup.json')
const pool = require('./pg');

async function main() {
  const [owner, addr1] = await ethers.getSigners();
  const Dyve = await ethers.getContractFactory('Dyve')
  const dyve = await Dyve.attach(s.dyve.address)
  await dyve.deployed()

  await network.provider.send("evm_setNextBlockTimestamp", [
    Math.floor(Date.now() / 1000) + 10,
  ]);
  await network.provider.send("evm_mine");

  const { rows: [data] } = await pool.query(
    `select * from "Orderbook" where signer = $1 AND status = 'BORROWED' ORDER BY nonce DESC LIMIT 1`,
    [owner.address]
  )
  const { rows: [takerData] } = await pool.query(
    `select * from "Orderbook" where taker = $1 AND "returnTokenId" IS NOT NULL ORDER BY nonce DESC LIMIT 1`,
    [addr1.address]
  )
  console.log("taker data: ", takerData)

  const { timestamp } = await ethers.provider.getBlock('latest');
  const message = await constructMessage({ 
    contract: s.mockERC721.address,
    tokenId: (takerData?.returnTokenId ?? 49) + 1,
    isFlagged: false,
    timestamp: timestamp - 100,
    signer: owner,
  })

  console.log("block timestamp: ", timestamp)
  console.log("message: ", message)
  console.log("")


  const closeTx = await dyve.connect(addr1).closePosition(data.orderHash, (takerData?.returnTokenId ?? 49) + 1, message);
  await closeTx.wait();

  console.log("Position closed: ", data.orderHash)
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});