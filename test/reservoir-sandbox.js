const { createClient, getClient } = require('@reservoir0x/reservoir-kit-client')
const queryString = require('query-string')
const axios = require('axios')

createClient({
  apiBase: 'https://api-goerli.reservoir.tools',
  source: 'www.dyve.xyz',
  apiKey: process.env.RESERVOIR_API_KEY,
});

// const generateApiKey = async () => {
//   const res = await fetch('https://api-goerli.reservoir.tools/api-keys', {
//     method: 'POST',
//     headers: {
//       accept: '*/*',
//       'content-type': 'application/x-www-form-urlencoded',
//       'x-api-key': 'dyve-api-key'
//     },
//     body: JSON.stringify({
//       appName: 'Dyve', 
//       email: 'admin@dyvenft.io', 
//       website: 'https://www.dyve.xyz'
//     })
//   })

//   return res.json()
// }

// const createBids = async (tokenAddress, tokenIds, signer, weiPrice) => {
//   const tokenBids = tokenIds.map(tokenId => ({
//     orderKind: 'seaport',
//     orderbook: 'reservoir',
//     automatedRoyalties: true,
//     excludeFlaggedTokens: false,
//     weiPrice, 
//     token: `${tokenAddress}:${tokenId}`,
//   }))

//   await getClient().actions.placeBid({
//     bids: tokenBids,
//     signer,
//     onProgress: (steps) => {
//       console.log("steps: ", JSON.stringify(steps, null, 2))
//       const incompleteSteps = steps.reduce((acc, step) => {
//         const items = step.items.filter(item => item.status == 'incomplete')

//         return [...acc, ...items]
//       }, [])
//       console.log("incomplete steps: ", JSON.stringify(incompleteSteps, null, 2))
//     }
//   })
// }

// const createListing = async (tokenAddress, tokenIds, signer, weiPrice) => {
//   const listings = tokenIds.map(tokenId => ({
//     orderKind: 'seaport',
//     orderbook: 'reservoir',
//     automatedRoyalties: true,
//     weiPrice,
//     token: `${tokenAddress}:${tokenId}`,
//   }))

//   await getClient().actions.listToken({
//     listings,
//     signer,
//     onProgress: (steps) => {
//       console.log("steps: ", JSON.stringify(steps, null, 2))
//       const incompleteSteps = steps.reduce((acc, step) => {
//         const items = step.items.filter(item => item.status == 'incomplete')

//         return [...acc, ...items]
//       }, [])
//       console.log("incomplete steps: ", incompleteSteps)
//     }
//   })
// }

// const buyToken = async (tokenAddress, tokenIds, expectedPrice, signer) => {
//   const tokens = tokenIds.map(tokenId => ({ tokenId, contract: tokenAddress }))
//   await getClient().actions.buyToken({
//     tokens,
//     signer,
//     expectedPrice,
//     onProgress: (steps) => {
//       console.log("steps: ", JSON.stringify(steps, null, 2))
//       const incompleteSteps = steps.reduce((acc, step) => {
//         const items = step.items.filter(item => item.status == 'incomplete')

//         return [...acc, ...items]
//       }, [])
//       console.log("incomplete steps: ", incompleteSteps)
//     }
//   })
// }

// const acceptBid = async (tokenAddress, tokenId, expectedPrice, signer) => {
//   const token = { tokenId, contract: tokenAddress }
//   await getClient().actions.acceptOffer({
//     token,
//     signer,
//     expectedPrice,
//     onProgress: (steps) => {
//       console.log("steps: ", JSON.stringify(steps, null, 2))
//       const incompleteSteps = steps.reduce((acc, step) => {
//         const items = step.items.filter(item => item.status == 'incomplete')

//         return [...acc, ...items]
//       }, [])
//       console.log("incomplete steps: ", incompleteSteps)
//     }
//   })
// }

// const getTokens = async (tokenAddress) => {
//   const query = queryString.stringify({
//     collection: tokenAddress,
//     sortBy: 'floorAskPrice',
//     limit: '20',
//     includeTopBid: 'false',
//     includeAttributes: 'false',
//   })

//   const res = await fetch(
//     `https://api-goerli.reservoir.tools/orders/bids/v3?${query}`,
//     {
//       method: 'GET', 
//       headers: {accept: '*/*', 'x-api-key': 'dyve-api-key'}
//     }
//   )

//   return res.json()
// }

// const fetchBids = async (tokenAddress, tokenId, continuationToken=null) => {
//   const query = queryString.stringify({
//     token: `${tokenAddress}:${tokenId}`,
//     includeMetadata: 'false',
//     includeRawData: 'false',
//     sortBy: 'price',
//     limit: '50',
//   })

//   const res = await fetch(
//     `https://api-goerli.reservoir.tools/orders/bids/v3?${query}`,
//     {
//       method: 'GET', 
//       headers: {accept: '*/*', 'x-api-key': 'dyve-api-key'}
//     }
//   )

//   return res.json()
// }

// const fetchListings = async (tokenAddress, continuationToken=null) => {
//   const query = queryString.stringify({
//     contracts: tokenAddress,
//     includePrivate: 'false',
//     includeMetadata: 'false',
//     includeRawData: 'false',
//     sortBy: 'createdAt',
//     limit: '1000',
//     continuationToken,
//   })

//   const res = await fetch(
//     `https://api-goerli.reservoir.tools/orders/bids/v3?${query}`,
//     {
//       method: 'GET', 
//       headers: {accept: '*/*', 'x-api-key': 'dyve-api-key'}
//     }
//   )

//   return res.json()
// }

// const getFloorPrice = async (collectionAddress) => {
//   const query = queryString.stringify({
//     collection: collectionAddress,
//   })

//   const res = await fetch(
//     `https://api-goerli.reservoir.tools/collections/sources/v1?${query}`,
//     {
//       method: 'GET', 
//       headers: {accept: '*/*', 'x-api-key': 'dyve-api-key'}
//     }
//   )

//   return res.json()
// }

const getOracleFloorPrice = async (collectionAddress) => {
  const query = queryString.stringify({
    kind: 'upper',
    twapSeconds: 86400,
  })

  const res = await axios({
    url: `https://api-goerli.reservoir.tools/oracle/collections/${collectionAddress}/floor-ask/v3?${query}`,
    method: 'GET', 
    headers: {accept: '*/*', 'x-api-key': 'dyve-api-key'}
  })

  return res.data
}

module.exports = {
  // generateApiKey,
  // createBids,
  // createListing,
  // buyToken,
  // acceptBid,
  // getTokens,
  // fetchBids,
  // fetchListings,
  // getFloorPrice,
  getOracleFloorPrice,
}
