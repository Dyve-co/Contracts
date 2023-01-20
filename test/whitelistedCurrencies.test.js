const { expect, use } = require("chai")
const { ethers } = require("hardhat")
use(require('chai-as-promised'))

let whitelistedCurrencies;
let mockUSDC;

beforeEach(async function () {
  const MockERC20 = await ethers.getContractFactory("MockERC20");
  mockUSDC = await MockERC20.deploy("USDC", "USDC");
  await mockUSDC.deployed();

  const WhitelistedCurrencies = await ethers.getContractFactory("WhitelistedCurrencies");
  whitelistedCurrencies = await WhitelistedCurrencies.deploy();
  await whitelistedCurrencies.deployed();
})

describe("WhitelistedCurrencies", function () {
  it.only("adds and removes USDC as a whitelisted currency", async () => {
    const addWhitelistTx = await whitelistedCurrencies.addWhitelistedCurrency(mockUSDC.address) 
    await addWhitelistTx.wait()

    await expect(whitelistedCurrencies.isCurrencyWhitelisted(mockUSDC.address)).to.be.eventually.true
    await expect(addWhitelistTx).to.emit(whitelistedCurrencies, "AddCurrencyToWhitelist").withArgs(mockUSDC.address)

    const removeWhitelistTx = await whitelistedCurrencies.removeWhitelistedCurrency(mockUSDC.address) 
    await removeWhitelistTx.wait()

    await expect(whitelistedCurrencies.isCurrencyWhitelisted(mockUSDC.address)).to.be.eventually.false
    await expect(removeWhitelistTx).to.emit(whitelistedCurrencies, "RemoveCurrencyFromWhitelist").withArgs(mockUSDC.address)
  })
})