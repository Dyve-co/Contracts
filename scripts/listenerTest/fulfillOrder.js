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
    `select * from "Orderbook" where signer = $1 ORDER BY nonce DESC LIMIT 1`,
    [owner.address]
  )
  const order = generateOrder(data)
  const signature = await generateSignature(order, owner, dyve)

  const { timestamp: fulfillOrderTimestamp } = await ethers.provider.getBlock('latest');
  const message = await constructMessage({ 
    contract: s.mockERC721.address,
    tokenId: data.tokenId,
    isFlagged: false,
    timestamp: fulfillOrderTimestamp - 10,
    signer: owner,
  })
  const makerOrder = { ...order, signature, premiumCollection: ethers.constants.AddressZero, premiumTokenId: 0 }

  console.log("fulfill timestamp: ", fulfillOrderTimestamp)
  console.log("message: ", message)
  console.log("maker order: ", makerOrder)
  console.log("")

  const borrowTx = await dyve.connect(addr1).fulfillOrder(makerOrder, message, { value: ethers.utils.parseEther("1.1").toString() })
  await borrowTx.wait()

  console.log("listing borrowed: ", data.orderHash)
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});