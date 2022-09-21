const hre = require("hardhat");

async function main() {
  const Borrower = await hre.ethers.getContractFactory("BorrowerNft");
  const borrower = await Borrower.deploy();
  await borrower.deployed();
  console.log("Borrower NFT contract deployed", borrower.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
