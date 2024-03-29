const hre = require("hardhat");

const addresses = {
  WETH: "0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6",
  USDC: "0xAC7eb1E0EA57f4A559EE694a78F2fcF39FC60A45",
  FEE_RECIPIENT: "0x304a688471A8b4349B1Ac3036B2eA85fCfcF6150",
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