const hre = require("hardhat");

async function main() {
  const Dyve = await hre.ethers.getContractFactory("Dyve");
  const dyve = await Dyve.deploy();
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
