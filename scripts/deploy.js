// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// You can also run a script with `npx hardhat run <script>`. If you do that, Hardhat
// will compile your contracts, add the Hardhat Runtime Environment's members to the
// global scope, and execute the script.
const hre = require("hardhat");
const fs = require('fs')

async function main() {


  const Dyve = await hre.ethers.getContractFactory("Dyve");
  const dyve = await Dyve.deploy();

  await dyve.deployed();

  console.log("Dyve Deployed:", dyve.address);

  const CoolCats = await hre.ethers.getContractFactory("CoolCats");
  const coolCats = await CoolCats.deploy();

  await coolCats.deployed();

  console.log("CoolCats Deployed:", coolCats.address);

  const output = { "CoolCatsAddress": coolCats.address, "DyveAddress": dyve.address }

  fs.open('./scripts/addresses.json', 'r', (fileExists, file) => {
    if (fileExists) {

      fs.writeFile('./scripts/addresses.json', JSON.stringify(output), (err) => {
        if (err) console.error(err)
        console.log('Data written')
      });

    } else {

      fs.writeFile('./scripts/addresses.json', JSON.stringify(output), (err) => {
        if (err) console.error(err)
        console.log('Data written')
      });
    }


  })
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
