const hre = require("hardhat");
const { fetchListings, buyToken } = require("./reservoir-sandbox")

async function main() {
  const [_, shortingAccount] = await hre.ethers.getSigners();
  const Dyve = await hre.ethers.getContractFactory('Dyve');
  const dyve = await Dyve.attach(process.env.DYVE_ADDRESS);

  const dyveListings = (await dyve.getAllListings()).filter(({ status }) => status === 1) 
  const { openSeaListings } = await [...Array(Math.ceil(dyveListings.length / 1000))]
    .reduce(async (previousPromise, i) => {
      const { openSeaListings, continuationToken } = await previousPromise
      const nextListings = await fetchListings(process.env.LENDER_ADDRESS, continuationToken)

      return {
        openSeaListings: [...openSeaListings, ...nextListings.orders],
        continuationToken: nextListings.continuationToken,
      }
    }, Promise.resolve({ listings: [], continuationToken: null }))
  console.log("Dyve and OpenSea listings fetched")
  
  const { dyveListings: closingNfts, totalPrice } = dyveListings.reduce((currentListings, { tokenId }) => {
    const { openSeaListings, dyveListings, totalPrice } = currentListings
    const replacementNft = openSeaListings.find(({ tokenSetId }) => tokenSetId.split(':')[2] !== tokenId.toString())

    const _openSeaListings = openSeaListings.filter(({ id }) => id !== replacementNft.id) 
    const _dyveListings = dyveListings.map(dyveListing => ({
      ...(dyveListing.tokenId === tokenId 
          ? { replacementTokenId: replacementNft.tokenSetId.split(':')[2] } 
          : {}
        ),
      ...dyveListing,
    }))
    const _totalPrice = replacementNft.price.amount.decimal + totalPrice

    return {
      openSeaListings: _openSeaListings,
      dyveListings: _dyveListings,
      totalPrice: _totalPrice,
    }
  }, { openSeaListings, dyveListings, totalPrice: 0 })
  console.log("OpenSea NFTs to purchase and total price configured")

  const tokenIdsToPurchase = closingNfts.map(({ replacementTokenId }) => replacementTokenId)
  await buyTokens(
    process.env.LENDER_ADDRESS,
    tokenIdsToPurchase,
    totalPrice,
    shortingAccount,
  )
  console.log("replacement tokens bought")

  for (const { dyveId, replacementTokenId } of closingNfts) {
    const closeTx = await dyve.closePosition(dyveId, replacementTokenId)
    await closeTx.wait()
    console.log(`NFT short position ${dyveId} closed`)
  }
  console.log(`All open NFT short positions closed by shorting account ${shortingAccount.address}`)
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
