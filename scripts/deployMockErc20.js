const { ethers } = require("hardhat");
const hre = require("hardhat");

async function main() {
  const [signer] = await ethers.getSigners()

  const MockERC20 = await ethers.getContractFactory('MockERC20')
  const mockErc20 = await MockERC20.attach("0xAC7eb1E0EA57f4A559EE694a78F2fcF39FC60A45")

  // const Dyve = await ethers.getContractFactory('Dyve')
  // const dyve = await Dyve.attach("0xA66974245eB048BFe9d61D7068102f7BB086E50A")
  // const whitelistedCurrenciesAddress = await dyve.whitelistedCurrencies()
  // const WhitelistedCurrencies = await ethers.getContractFactory('WhitelistedCurrencies')
  // const whitelistedCurrencies = await WhitelistedCurrencies.attach(whitelistedCurrenciesAddress)

  // const tx = await whitelistedCurrencies.addWhitelistedCurrency(mockErc20.address)
  // await tx.wait()
  // console.log("added USDC currency")

  // const mockErc20 = await MockERC20.deploy('USDC', 'USDC')
  // console.log("Mock ERC20 token deployed: ", mockErc20.address)

  const balance = await mockErc20.allowance(signer.address, "0xAC7eb1E0EA57f4A559EE694a78F2fcF39FC60A45")
  console.log("balance: ", balance)

  // const tx = await mockErc20.mint(signer.address, ethers.utils.parseEther('100000'))
  // await tx.wait()
  // console.log("Minted 100000 USDC to ", signer.address)
}


// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

