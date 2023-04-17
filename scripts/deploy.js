const hre = require("hardhat");

const addresses = {
  WETH: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
  USDC: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  FEE_RECIPIENT: "0x3872D1b3f493C497BFbdb0C32CC539457C926F8E",
}

async function main() {
  // deploy contracts
  const WhitelistedCurrencies = await ethers.getContractFactory("WhitelistedCurrencies");
  const whitelistedCurrencies = await WhitelistedCurrencies.deploy();
  await whitelistedCurrencies.deployed();
  console.log("Whitelisted Currencies deployed: ", whitelistedCurrencies.address)

  const ProtocolFeeManager = await ethers.getContractFactory("ProtocolFeeManager");
  const protocolFeeManager = await ProtocolFeeManager.deploy(0);
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

  // add currencies
  const addWETHWhitelistTx = await whitelistedCurrencies.addWhitelistedCurrency(addresses.WETH)
  await addWETHWhitelistTx.wait()
  console.log("WETH added to whitelist")

  const addUSDCWhitelistTx = await whitelistedCurrencies.addWhitelistedCurrency(addresses.USDC)
  await addUSDCWhitelistTx.wait()
  console.log("USDC added to whitelist")

  // transfer ownerships
  const whitelistedCurrenciesOwnershipTransferTx = await whitelistedCurrencies.transferOwnership(addresses.FEE_RECIPIENT)
  whitelistedCurrenciesOwnershipTransferTx.wait()
  console.log("transferred whitelisted currencies ownership")

  const protocolFeeManagerOwnershipTransferTx = await protocolFeeManager.transferOwnership(addresses.FEE_RECIPIENT)
  protocolFeeManagerOwnershipTransferTx.wait()
  console.log("transferred protocol fee manager ownership")

  const reservoirOracleOwnershipTransferTx = await reservoirOracle.transferOwnership(addresses.FEE_RECIPIENT)
  reservoirOracleOwnershipTransferTx.wait()
  console.log("transferred reservoir oracle ownership")

  const dyveOwnershipTransferTx = await dyve.transferOwnership(addresses.FEE_RECIPIENT)
  dyveOwnershipTransferTx.wait()
  console.log("transferred dyve ownership")
  
  // verify contracts
  await hre.run("verify:verify", {
    address: whitelistedCurrencies.address,
    constructorArguments: [],
  });

  await hre.run("verify:verify", {
    address: '0x1b732F57aF5e045Ce6F6Eac19733e083796D4A07',
    constructorArguments: [0],
  });

  await hre.run("verify:verify", {
    address: '0x1D76C8e2591899f6Bd86937268e7e9E6B168E094',
    constructorArguments: ["0xAeB1D03929bF87F69888f381e73FBf75753d75AF"],
  });

  await hre.run("verify:verify", {
    address: '0x6ef7d9A6edb147e95eb884Bb077983da2B298777',
    constructorArguments: [
      '0x64b737f2eCc3a5fbaD58f448d4E9d52a14d70183',
      '0x1b732F57aF5e045Ce6F6Eac19733e083796D4A07',
      '0x1D76C8e2591899f6Bd86937268e7e9E6B168E094',
      addresses.FEE_RECIPIENT
    ],
  });
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});