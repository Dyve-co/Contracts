const hre = require('hardhat');
const { ethers } = require('ethers');
const { createClient, getClient } = require('@reservoir0x/reservoir-kit-client')
const sdk = require('api')('@reservoirprotocol/v1.0#4s41jl7lbupq7');

sdk.auth('dyve-api-key');
sdk.server('https://api-goerli.reservoir.tools');

createClient({
  apiBase: 'https://api-goerli.reservoir.tools',
  source: 'www.dyve.xyz',
  apiKey: process.env.RESERVOIR_API_KEY,
});

const generateApiKey = async () => {
  const res = await sdk.postApikeys({ 
    appName: 'Dyve',
    email: '0xNahhh@gmail.com',
    website: 'http://dyve.xyz'
  }, {accept: '*/*'})

  return res
}

const approveWrapping = async () => {
  const [testAccount2, _] = await hre.ethers.getSigners();
  console.log("test account 2: ", testAccount2.address)
  const Weth = await hre.ethers.getContractFactory('WETH9');
  const weth = await Weth.attach('0xc778417E063141139Fce010982780140Aa0cD5Ab');

  // Wraps eth
  const depositTx = await weth.connect(testAccount2).deposit({ value: ethers.utils.parseEther('0.1') });
  await depositTx.wait()
  console.log("eth wrapped and deposited")

  // gets approval
  const approvalTx = await weth.connect(testAccount2).approve('0x1E0049783F008A0085193E00003D00cd54003c71', ethers.utils.parseEther('0.1'));
  await approvalTx.wait()
  console.log("approval granted")

  const bid = await sdk.postExecuteBidV4({
    params: [
      {
        orderKind: 'seaport',
        orderbook: 'opensea',
        automatedRoyalties: true,
        excludeFlaggedTokens: false,
        weiPrice: ethers.utils.parseEther('0.1').toString(),
        token: '0x278ee15785c8fecbadda9d3499970c84c040fffe:0'
      }
    ],
    maker: testAccount2.address,
  }, {accept: '*/*'})
  console.log("bid: ", JSON.stringify(bid, null, 2))
}

const createBids = async (tokenAddress, tokenIds, signer, weiPrice) => {
  const tokenBids = tokenIds.map(tokenId => ({
    orderKind: 'seaport',
    orderbook: 'reservoir',
    automatedRoyalties: true,
    excludeFlaggedTokens: false,
    weiPrice, 
    token: `${tokenAddress}:${tokenId}`,
  }))

  await getClient().actions.placeBid({
    bids: tokenBids,
    signer,
    onProgress: (steps) => {
      // console.log("steps: ", JSON.stringify(steps, null, 2))
      const incompleteSteps = steps.reduce((acc, step) => {
        const items = step.items.filter(item => item.status == 'incomplete')

        return [...acc, ...items]
      }, [])
      console.log("incomplete steps: ", JSON.stringify(incompleteSteps, null, 2))
    }
  })
}

const createListing = async (tokenAddress, tokenIds, signer, weiPrice) => {
  const listings = tokenIds.map(tokenId => ({
    orderKind: 'seaport',
    orderbook: 'reservoir',
    automatedRoyalties: true,
    weiPrice,
    token: `${tokenAddress}:${tokenId}`,
  }))

  await getClient().actions.listToken({
    listings,
    signer,
    onProgress: (steps) => {
      // console.log("steps: ", JSON.stringify(steps, null, 2))
      const incompleteSteps = steps.reduce((acc, step) => {
        const items = step.items.filter(item => item.status == 'incomplete')

        return [...acc, ...items]
      }, [])
      console.log("incomplete steps: ", JSON.stringify(incompleteSteps, null, 2))
    }
  })
}

module.exports = {
  createBids,
  createListing,
}
