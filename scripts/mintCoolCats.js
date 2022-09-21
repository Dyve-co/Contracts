// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// You can also run a script with `npx hardhat run <script>`. If you do that, Hardhat
// will compile your contracts, add the Hardhat Runtime Environment's members to the
// global scope, and execute the script.
const hre = require("hardhat");
const addresses = require('./addresses.json')

async function main() {
  const CoolCats = await hre.ethers.getContractFactory("CoolCats");
  const coolCats = await CoolCats.attach(addresses.CoolCatsAddress);
  console.log("CoolCats Attached: ", coolCats.address);

  for (const i of [...Array(11).keys()]) {
    const tx = await coolCats.mint()
    await tx.wait()
    console.log("minted: ", i)
  }
  console.log("11 Cool Cats minted")

  const owner = await coolCats.ownerOf(1);
  console.log("owner: ", owner);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
