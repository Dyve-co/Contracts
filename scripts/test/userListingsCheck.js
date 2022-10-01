const hre = require("hardhat");
const { utils } = require("ethers")

async function main() {
  const [account1, account2] = await hre.ethers.getSigners();
  const Borrower = await hre.ethers.getContractFactory('BorrowerNft');
  const Dyve = await hre.ethers.getContractFactory('DyveAlpha');

  const borrower = await Borrower.deploy();
  const dyve = await Dyve.deploy();

  const mintTx = await borrower.mint()
  await mintTx.wait()

  const approveResult = await borrower.approve(dyve.address, 1)
  await approveResult.wait()
  console.log("transaction approved")

  const listTx = await dyve.list(borrower.address, 1, utils.parseEther("1"), utils.parseEther("0.1"))
  await listTx.wait()
  console.log("NFT listed")

  const btsTx = await dyve.borrowToShort(0, { value: utils.parseEther("1.1") })
  await btsTx.wait()
  console.log("NFT borrowed to short")

  const listing = await dyve.listings(0)
  const userListing = await dyve.userListings(account1.address, 0)

  console.log("listing", listing)
  console.log("user listing: ", userListing)
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
