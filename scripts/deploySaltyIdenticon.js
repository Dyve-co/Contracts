const hre = require("hardhat");

async function main() {
  const SaltyIdenticon = await ethers.getContractFactory('SaltyIdenticon')

  const saltyIdenticon = await SaltyIdenticon.deploy('https://testnet-nft-metadata.s3.amazonaws.com/')
  console.log("Salty Identicon collection deployed: ", saltyIdenticon.address)
}


// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

