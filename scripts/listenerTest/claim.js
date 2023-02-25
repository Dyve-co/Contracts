const { ethers } = require("hardhat");
const { setup, tokenSetup, generateOrder, generateSignature, computeOrderHash, constructMessage } = require("../../test/helpers")
const s = require('./setup.json')
const pool = require('./pg');

async function main() {
  const [owner, addr1] = await ethers.getSigners();
  const Dyve = await ethers.getContractFactory('Dyve')
  const dyve = await Dyve.attach(s.dyve.address)
  await dyve.deployed()

  const { rows: [data] } = await pool.query(
    `select * from "Orderbook" where signer = $1 AND status = 'BORROWED' ORDER BY nonce DESC LIMIT 1`,
    [owner.address]
  )

  await network.provider.send("evm_setNextBlockTimestamp", [
    Math.floor(new Date(data.expiryDateTime).getTime() / 1000) + 100,
  ]);
  await network.provider.send("evm_mine");

  const claimTx = await dyve.claimCollateral(data.orderHash);
  await claimTx.wait();

  console.log("claimed collateral: ", data.orderHash)
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});