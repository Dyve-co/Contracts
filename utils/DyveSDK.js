const ERC721ABI = require('./ERC721.abi.json')
const DYVEABI = require('./DYVE.abi.json')
const types = require('./types')
const { ethers } = require('ethers')

const camelCase = (object) => Object.keys(object)
  .reduce((acc, key) => ({ ...acc, [key.replace(/_([a-z])/g, (g) => g[1].toUpperCase())]: object[key] }), {})

class DyveSDK {
  constructor(provider, signer, dyveAddress) {
    this.provider = provider
    this.signer = signer
    this.dyveAddress = dyveAddress
  }

  async getOwnedNFTs(owner, options={}) {
    // const { ownedNfts, pageKey, totalCount } = this.alchemy.nft.getNftsForOwner(owner)
    const nfts = await this.alchemy.nft.getNftsForOwner(owner, options)

    return nfts
  }

  async getNFTMetadata (collectionAddress, tokenId, type) {
    return this.alchemy.nft.getNftMetadata(collectionAddress, tokenId, type)
  }

  async getAllListings() {
    const listings = (await api.getListings())
      .map(listing => camelCase(listing))

    return listings
  } 

  async getListing(id) {
    const dyve = new ethers.Contract(this.dyveAddress, DYVEABI, this.signer)
    return dyve.getListing(id)
  }

  async getUserListings() {
    const address = await this.signer.getAddress()
    const listings = (await api.getUserOrders(address))
      .map(listing => camelCase(listing))

    return listings
  }

  async generateSignature(data) {
    const { chainId } = await this.provider.getNetwork()
    const domain = {
      name: "Dyve",
      version: import.meta.env.VITE_DYVE_VERSION,
      chainId,
      verifyingContract: import.meta.env.VITE_DYVE_ADDRESS,
    }

    const signature = (await this.signer._signTypedData(domain, types, data)).substring(2)
    console.log("signature: ", signature)

    const r = "0x" + signature.slice(0, 64)
    const s = "0x" + signature.slice(64, 128)
    const v = parseInt(signature.slice(128, 130), 16)

    console.log("r: ", r)
    console.log("s: ", s)
    console.log("v: ", v)

    return { v, r, s }
  }

  async list(collection, tokenId, collateral, fee, duration) {
    const signer = await this.signer.getAddress()
    const data = {
      isOrderAsk: true,
      signer,
      collection,
      tokenId,
      duration,
      collateral: ethers.utils.parseEther(collateral).toString(),
      // baseCollateral: ethers.utils.parseEther(baseCollateral).toString(),
      // collateralMultiplier,
      fee: ethers.utils.parseEther(fee).toString(),
      status: 'LISTED',
      startTime: Math.floor(Date.now() / 1000),
      endTime: Math.floor(Date.now() / 1000) + 1209600,
      // nonce, TODO: manage nonces on-chain
    }
    console.log("data: ", data)

    const signature = await this.generateSignature(data)
    const listing = camelCase(await api.list({ ...data, ...signature }))
    console.log("listing: ", listing)

    return listing
  }

  async isApproved(collection) {
    const nftContract = new ethers.Contract(collection, ERC721ABI, this.signer)
    const account = await this.signer.getAddress()
    const isApproved = await nftContract.isApprovedForAll(account, this.dyveAddress) 
    return isApproved
  }

  async approveForAll(collection) {
    const nftContract = new ethers.Contract(collection, ERC721ABI, this.signer)
    const tx = await nftContract.setApprovalForAll(this.dyveAddress, true)
    return tx.wait()
  }

  async getCollectionName(collection) {
    const nftContract = new ethers.Contract(collection, ERC721ABI, this.signer)
    const collectionName = await nftContract.name()
    return collectionName
  }

  async sell(collectionAddress, tokenId, bestBidPrice) {
    return acceptBid(
      collectionAddress,
      tokenId,
      bestBidPrice,
      this.signer
    )
  }

  async borrow(dyveId, message, totalSum) {
    const dyve = new ethers.Contract(this.dyveAddress, DYVEABI, this.signer)
    const tx = await dyve.borrow(dyveId, message, { value: totalSum })
    return tx.wait()
  }

  async borrowByTokenId(tokenId) {
    const dyve = new ethers.Contract(this.dyveAddress, DYVEABI, this.signer)
    const listings = await dyve.getAllListings()
    const listingItem = listings.filter(item => {
      return item.tokenId.toNumber() == tokenId
    })[0]

    await this.borrow(listingItem)
  }

  async closePosition(dyveId, replacementTokenId) {
    const dyve = new ethers.Contract(this.dyveAddress, DYVEABI, this.signer)
    const tx = await dyve.closePosition(dyveId, replacementTokenId)
    return tx.wait()
  }

  async cancel(dyveId) {
    const listing = await api.cancel(dyveId)
    
    return listing
  }

  async update(dyveId, collection, tokenId, collateral, fee, duration) {
    const signer = await this.signer.getAddress()
    const data = {
      isOrderAsk: true,
      signer,
      collection,
      tokenId,
      duration,
      collateral: ethers.utils.parseEther(collateral).toString(),
      // baseCollateral: ethers.utils.parseEther(baseCollateral).toString(),
      // collateralMultiplier,
      fee: ethers.utils.parseEther(fee).toString(),
      status: 'LISTED',
      startTime: Math.floor(Date.now() / 1000),
      endTime: Math.floor(Date.now() / 1000) + 1209600,
      // nonce, TODO: manage nonces on-chain
    } 
    console.log("data: ", data)

    const signature = await this.generateSignature(data)
    const listing = camelCase(await api.update({ id: dyveId, ...data, ...signature }))

    return listing
  }

  async claim(dyveId) {
    const dyve = new ethers.Contract(this.dyveAddress, DYVEABI, this.signer)
    const tx = await dyve.claimCollateral(dyveId)
    return tx.wait()
  }

  async getFloorPrice(collectionAddress) {
    const { sources }= await getFloorPrice(collectionAddress)
    const floorPrice = sources[0]?.floorAskPrice

    return floorPrice
  }

  async getOracleFloorPrice(collectionAddress) {
    const oracleFloorPrice = await getOracleFloorPrice(collectionAddress)

    return oracleFloorPrice
  }
}

module.exports = DyveSDK
