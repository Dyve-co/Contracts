const { expect } = require('chai');
const { ethers } = require('hardhat');
const { DyveSDK } = require('../utils/DyveSDK')

const ListingStatus = {
  LISTED: 0,
  SHORTED: 1,
  BORROWED: 2,
  EXPIRED: 3,
  CLOSED: 4,
}

describe('CoolCats Tests', async function () {
  var provider, Dyve, dyve, dyveBorrow, dyveLend, Escrow, escrow, CoolCats, coolCats, owner, ownedNfts;

  it('Should deploy Dyve.sol', async () => {
    Dyve = await ethers.getContractFactory('Dyve');
    dyve = await Dyve.deploy();
    provider = ethers.providers.getDefaultProvider()

  })

  it('Should deploy CoolCats.sol', async () => {
    CoolCats = await ethers.getContractFactory('CoolCats');
    coolCats = await CoolCats.deploy();
    [lenderSigner, borrowerSigner] = await ethers.getSigners()

    lender = await lenderSigner.getAddress()
    owner = lender
    borrower = await borrowerSigner.getAddress()

    dyveBorrow = dyve.connect(borrowerSigner)
    dyveLend = dyve
    coolCatsBorrow = coolCats.connect(borrowerSigner)
    coolCatsLend = coolCats
  })

  describe('CoolCats NFT tests', function () {
    it('should get owner of tokenId 0', async () => {
      const result = await coolCats.ownerOf(0)
      expect(owner === result).true
    })

    it('should get owner of tokenId 1', async () => {
      const result = await coolCats.ownerOf(1)
      expect(owner === result).true
    })

    it('should fail because there is not tokenId 2', async () => {
      try {
        const result = await coolCats.ownerOf(2)
        expect(owner !== result).true
      } catch (err) {
        return
      }
    })

    it('should get the total number of CoolCats', async () => {

      ownedNfts = [];

      for (let i = 0; i < 100; i++) {
        try {
          const ownerAddress = await coolCats.ownerOf(i)

          if (ownerAddress == lender) {
            ownedNfts.push(i);
          }
        } catch (err) {
          expect(ownedNfts.length == 11 && ownedNfts[0] == 0 && ownedNfts[1] == 1).true
          break;
        }
      }
    })

    it('should get the total number of CoolCats via sdk', async () => {
      const dyveSdk = new DyveSDK(provider, lenderSigner, dyve.address)
      const cats = await dyveSdk.getOwnedNFTs(coolCats.address)
      expect(cats.length === 11)
    })

    it('should get the name of the collection', async () => {
      const collectionName = await coolCats.name()
      expect(collectionName === 'CoolCats').true
    })
  })

  describe('Dyve collection name test', function () {

    it('should get collection name', async () => {
      const dyveSDK = new DyveSDK(provider, lenderSigner, dyve.address)
      const collectionAddress = coolCatsLend.address // nft contract address
      const collectionName = await dyveSDK.getCollectionName(collectionAddress)
      expect(collectionName == 'CoolCats')
    })
  })

  describe('Dyve lender tests', function () {
    it('should test sdk list', async () => {
      const dyveSDK = new DyveSDK(provider, lenderSigner, dyve.address)
      const collectionAddress = coolCatsLend.address // nft contract address
      const collectionId = 0 // token id in the collection
      const collateral = 1 // amount of eth
      const fee = ethers.utils.parseUnits('0.1')

      // list transaction
      const result = await dyveSDK.list(collectionAddress, collectionId, collateral, fee)
    })

    it('should get all listings', async () => {
      const dyveSDK = new DyveSDK(provider, lenderSigner, dyve.address)

      const listings = await dyveSDK.getAllListings()
      expect(listings.length == 1).true
    })
  })

  describe('Dyve borrow tests', function () {
    it('should be able to borrow to Short ID', async () => {
      const dyveSDK = new DyveSDK(provider, borrowerSigner, dyve.address)

      const collateral = await ethers.utils.parseUnits('1.12', 18)
      await dyveSDK.borrowToShort(0, collateral)
      const listings = await dyveSDK.getAllListings()

      expect(listings.length === 1).true
      // expect(listings[0].status == ListingStatus.SHORTED).true
    })

    it('should be able to close the position and return a different NFT via sdk', async () => {
      await coolCatsLend.transferFrom(lender, borrower, 1) // transfer second token to borrower so he can return it back

      const dyveSDK = new DyveSDK(provider, borrowerSigner, dyve.address)
      const result = await dyveSDK.closePosition(coolCats.address, 0, 1)
      const listing = await dyveBorrow.listings(0)
      expect(listing.status == ListingStatus.CLOSED).true
    })
  })
})