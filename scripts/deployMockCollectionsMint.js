const hre = require("hardhat");

async function main() {
  const MockCollectionsMint = await ethers.getContractFactory('MockCollectionsMint')

  const mockCollectionsMint = await MockCollectionsMint.deploy(
    '0x10b8b56d53bfa5e374f38e6c0830bad4ebee33e6',
    '0xec1254f8ecf5137f04b7079464A656b82f163Fc0'
  )
  console.log("Mock Collections Mint contract deployed: ", mockCollectionsMint.address)
}


// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

