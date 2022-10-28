const hre = require("hardhat");

async function main() {
  const ProtocolFeeRecipient = await hre.ethers.getContractFactory("Escrow");
  const protocolFeeRecipient = await ProtocolFeeRecipient.deploy();
  await protocolFeeRecipient.deployed();
  console.log("Protocol Fee Recipient deployed", protocolFeeRecipient.address);

  const Escrow = await hre.ethers.getContractFactory("Escrow");
  const escrow = await Escrow.deploy();
  await escrow.deployed();
  console.log("Escrow contract deployed", escrow.address);

  const Dyve = await hre.ethers.getContractFactory("Dyve");
  const dyve = await Dyve.deploy(escrow.address, protocolFeeRecipient.address);
  const tx = await dyve.deployTransaction.wait();

  console.log("block number: ", tx.blockNumber);
  console.log("Dyve Deployed:", dyve.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
