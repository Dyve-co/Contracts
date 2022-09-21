const hre = require("hardhat");

async function main() {
  const Lender = await hre.ethers.getContractFactory("LenderNft");
  const lender = await Lender.deploy();
  await lender.deployed();
  console.log("Lender NFT contract deployed", lender.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
