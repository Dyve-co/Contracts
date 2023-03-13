const { ethers } = require("hardhat");
const { setup, tokenSetup, generateSignature, computeOrderHash, constructMessage, snakeToCamel } = require("../../test/helpers")
const s = require('./setup.json')
const pool = require('./mysql');

async function main() {
  const [owner] = await ethers.getSigners();
  const Dyve = await ethers.getContractFactory('Dyve')
  const dyve = await Dyve.attach(s.dyve.address)
  await dyve.deployed()

  let orders
  [orders] = await pool.query(
    `select * from orderbook where signer = ?`,
    [owner.address]
  )
  orders = orders.map(order => snakeToCamel(order))

  const nonces = orders.map(o => o.nonce)
  const tx = await dyve.cancelMultipleMakerOrders(nonces)
  await tx.wait()

  console.log("orders should be cancelled now: ", nonces)
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});