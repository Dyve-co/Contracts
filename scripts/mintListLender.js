const hre = require("hardhat");
const { createListing } = require("./reservoir-sandbox")

const LIST_PRICE = hre.ethers.utils.parseEther('0.001')
async function main() {
  const provider = hre.ethers.provider
  const bidListAccount = new hre.ethers.Wallet(process.env.PRIVATE_KEY_BID_LIST, provider)
  const Lender = await hre.ethers.getContractFactory("LenderNft");
  // const lender = await Lender.attach(process.env.LENDER_ADDRESS);
  const lender = await Lender.attach('0xB557498d3541A5675A5FE1CF5E744D328EBa2b31');

  const totalSupply = await lender.totalSupply()
  const tx = await lender.connect(bidListAccount).batchMint(100)
  await tx.wait()
  console.log(`100 Lender NFTs minted by bid list account ${bidListAccount.address}`)

  const nftIds = [...Array(totalSupplyPrev).keys()].map((i) => i + totalSupply + 1)
  await createListing(
    lender.address,
    nftIds,
    bidListAccount,
    LIST_PRICE,
  )
  console.log(`100 nfts listed by ${bidListAccount.address}`)
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
