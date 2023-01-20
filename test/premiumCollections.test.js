const { expect, use } = require("chai")
const { ethers } = require("hardhat")
use(require('chai-as-promised'))

let premiumCollections;
let lender;

beforeEach(async function () {
  const Lender = await ethers.getContractFactory("LenderNft");
  lender = await Lender.deploy();
  await lender.deployed();

  const PremiumCollections = await ethers.getContractFactory("PremiumCollections");
  premiumCollections = await PremiumCollections.deploy();
  await premiumCollections.deployed();
})

describe("PremiumCollections", function () {
  it("adds and removes lender as a premium collection", async () => {
    const addPremiumCollectionTx = await premiumCollections.updatePremiumCollection(lender.address, 1) 
    await addPremiumCollectionTx.wait()

    await expect(premiumCollections.getFeeRate(lender.address)).to.be.eventually.equal(1)
    await expect(addPremiumCollectionTx).to.emit(premiumCollections, "UpdatedPremiumCollection").withArgs(lender.address, 1)

    const removePremiumCollectionTx = await premiumCollections.updatePremiumCollection(lender.address, 0)
    await removePremiumCollectionTx.wait()

    await expect(premiumCollections.getFeeRate(lender.address)).to.be.eventually.equal(0)
    await expect(removePremiumCollectionTx).to.emit(premiumCollections, "UpdatedPremiumCollection").withArgs(lender.address, 0)
  })
})