const hre = require("hardhat");
const { createListing, createBids } = require("./reservoir-sandbox")

const LIST_PRICE = ethers.utils.parseEther('0.01').toString() 
const BID_PRICE = ethers.utils.parseEther('0.123').toString() 
const COLLATERAL = ethers.utils.parseEther('1')
const FEE = ethers.utils.parseEther('0.01')

async function main() {
  const [listingAccount, bidderAccount] = await hre.ethers.getSigners();
  // listing account: 0x5bb2610C42280674d6f70682f76311B44D1c07FB
  // bidder account: 0x43cb58a59319045cA062Ad8F13f8bD593E1B1334
  const Borrower = await hre.ethers.getContractFactory('BorrowerNft');
  const Dyve = await hre.ethers.getContractFactory('Dyve');

  const borrower = await Borrower.attach(process.env.BORROWER_ADDRESS);
  const dyve = await Dyve.attach(process.env.DYVE_ADDRESS);

  const currentTotalSupply = (await borrower.totalSupply()).toNumber();
  console.log("current total supply", currentTotalSupply);

  const mint_tx = await borrower.connect(listingAccount).batchMint(10);
  await mint_tx.wait();
  console.log("10 Borrower NFTs minted")

  console.log("borrower address: ", borrower.address)
  await createBids(
    borrower.address,
    [...Array(10).keys()].map(i => i + currentTotalSupply + 1),
    bidderAccount,
    BID_PRICE
  )
  console.log("10 bids made on newly minted Borrower NFTs on OpenSea")

  for (const tokenId of [...Array(5).keys()].map(i => i + currentTotalSupply + 1)) {
    console.log("token Id to be approved: ", tokenId);
    const approve_tx = await borrower.connect(listingAccount).approve(dyve.address, tokenId);
    await approve_tx.wait();
    console.log(`token ${tokenId} approved`)

    const list_tx = await dyve.connect(listingAccount).list(
      borrower.address,
      tokenId,
      COLLATERAL,
      FEE,
    );
    await list_tx.wait();
    console.log(`token ${tokenId} listed`)
  }
  console.log("5 Borrower NFTs listed on Dyve")

  await createListing(
    borrower.address,
    [...Array(5).keys()].map(i => 5 + i + currentTotalSupply + 1),
    listingAccount, 
    LIST_PRICE,
  )
  console.log("5 Borrower NFTs listed on OpenSea")
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
