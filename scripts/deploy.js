const hre = require("hardhat");

const addresses = {
  WETH: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
  USDC: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  FEE_RECIPIENT: "0x3872D1b3f493C497BFbdb0C32CC539457C926F8E",
}

async function main() {
  const WhitelistedCurrencies = await ethers.getContractFactory("WhitelistedCurrencies");
  const whitelistedCurrencies = await WhitelistedCurrencies.deploy();
  await whitelistedCurrencies.deployed();
  console.log("Whitelisted Currencies deployed: ", whitelistedCurrencies.address)

  const ProtocolFeeManager = await ethers.getContractFactory("ProtocolFeeManager");
  const protocolFeeManager = await ProtocolFeeManager.deploy(1000);
  await protocolFeeManager.deployed();
  console.log("Protocol Fee Manager deployed: ", protocolFeeManager.address)

  const ReservoirOracle = await ethers.getContractFactory("ReservoirOracle");
  const reservoirOracle = await ReservoirOracle.deploy("0xAeB1D03929bF87F69888f381e73FBf75753d75AF");
  await reservoirOracle.deployed();
  console.log("Reservoir Oracle deployed: ", reservoirOracle.address)

  const Dyve = await ethers.getContractFactory("Dyve");
  const dyve = await Dyve.deploy(
    whitelistedCurrencies.address, 
    protocolFeeManager.address, 
    reservoirOracle.address,
    addresses.FEE_RECIPIENT
  );
  const tx = await dyve.deployTransaction.wait();
  console.log("block number: ", tx.blockNumber);
  console.log("Dyve Deployed:", dyve.address);

  const addWETHWhitelistTx = await whitelistedCurrencies.addWhitelistedCurrency(addresses.WETH)
  await addWETHWhitelistTx.wait()
  console.log("WETH added to whitelist")

  const addUSDCWhitelistTx = await whitelistedCurrencies.addWhitelistedCurrency(addresses.USDC)
  await addUSDCWhitelistTx.wait()
  console.log("USDC added to whitelist")
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});