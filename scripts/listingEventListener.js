const hre = require("hardhat");
const dyveAbi = require("../artifacts/contracts/Dyve.sol/Dyve.json").abi

async function main() {
  const [_, borrowerAccount] = await hre.ethers.getSigners();
  const provider = new ethers.providers.WebSocketProvider(
    `wss://eth-goerli.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
  );
  const dyve = new ethers.Contract(process.env.DYVE_ADDRESS, dyveAbi, provider);
  // dyve.on('ListingEvent', async (lender, dyveId, nftCollectionId) => {
  //   console.log("lender: ", lender)
  //   console.log("dyve ID: ", dyveId.toNumber())
  //   console.log("nft collection: ", nftCollectionId.toNumber())

  //   const borrowToShortTx = await dyve.buyToshort(dyveId)
  //   await borrowToShortTx.wait()
  //   console.log(`NFT ${nftCollectionId} bought to short`)

  // })
  dyve.queryFilter('ListingEvent', async ())
  console.log("now listening for listing events")
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
