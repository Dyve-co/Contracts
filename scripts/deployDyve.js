const hre = require("hardhat");

async function main() {
  const Dyve = await hre.ethers.getContractFactory("Dyve");
  const dyve = await Dyve.deploy();
  await dyve.deployed();
  console.log("Dyve NFT contract deployed", dyve.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
