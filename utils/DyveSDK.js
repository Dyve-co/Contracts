const ERC721ABI = require('./ERC721.abi.json')
const DYVEABI = require('./DYVE.abi.json')

const { ethers } = require('ethers')

class DyveSDK {

  constructor(provider, signer, dyveAddress) {
    this.provider = provider
    this.signer = signer
    this.dyveAddress = dyveAddress
  }

  async getOwnedNFTs(nftCollectionAddress) {
    const nftContract = new ethers.Contract(nftCollectionAddress, ERC721ABI, this.signer)

    const getNfts = new Promise(async (resolve) => {
      let ownedNfts = [];

      for (let i = 0; i <= 100; i++) {
        try {

          const ownerAddress = await nftContract.ownerOf(i)

          if (ownerAddress == lender) {
            ownedNfts.push(i);
          }

        } catch (err) {
          if (i === 100) resolve(ownedNfts)
        }
      }
    })

    return Promise.resolve(getNfts)
  }

  async getAllListings() {
    const dyve = new ethers.Contract(this.dyveAddress, DYVEABI, this.signer)
    return await dyve.getAllListings()
  }

  async list(nftCollectionAddress, nftId, collateralRequired, fee) {
    const nftContract = new ethers.Contract(nftCollectionAddress, ERC721ABI, this.signer)

    const dyve = new ethers.Contract(this.dyveAddress, DYVEABI, this.signer)

    // approve transaction
    const approveResult = await nftContract.approve(this.dyveAddress, nftId) // approve token 0
    await approveResult.wait()

    // list transaction
    const result = await dyve.list(nftCollectionAddress, nftId, collateralRequired, fee)
    await result.wait()

    return await dyve.listings(nftId)
  }

  async getCollectionName(nftCollectionAddress) {
    const nftContract = new ethers.Contract(nftCollectionAddress, ERC721ABI, this.signer)
    const collectionName = await nftContract.name()
    return collectionName
  }

  async borrowToShort(dyveId, collateral) {
    const dyve = new ethers.Contract(this.dyveAddress, DYVEABI, this.signer)
    const result = await dyve.borrowToShort(dyveId, { value: collateral })
    return await result.wait()
  }

  async borrow(listingItem) {
    await this.borrow(listingItem.dyveId)
  }

  async borrowByNFTID(nftid) {
    console.log('nftid', nftid)
    const dyve = new ethers.Contract(this.dyveAddress, DYVEABI, this.signer)
    const listings = await dyve.getAllListings()
    const listingItem = listings.filter(item => {
      return item.nftId.toNumber() == nftid
    })[0]

    await this.borrow(listingItem)
  }

  async closePosition(nftCollectionAddress, position, replacementNFT) {
    const dyve = new ethers.Contract(this.dyveAddress, DYVEABI, this.signer)
    const nftContract = new ethers.Contract(nftCollectionAddress, ERC721ABI, this.signer)

    const approveResult = await nftContract.approve(dyve.address, replacementNFT) // approve token 0
    await approveResult.wait()

    const result = await dyve.closePosition(position, replacementNFT)
  }
}

module.exports = { DyveSDK }


