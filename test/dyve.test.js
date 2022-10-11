const { expect, use } = require("chai")
const { ethers } = require("hardhat")
use(require('chai-as-promised'))

function range(size, startAt = 0) {
  return [...Array(size).keys()].map(i => i + startAt);
}

let accounts;
let owner;
let addr1;
let addr2;
let addrs;
let dyve;
let lender;

const LISTED = 0
const SHORTED = 1
const BORROWED = 2
const EXPIRED = 3
const CLOSE = 4

beforeEach(async function () {
  accounts = await ethers.getSigners(); 
  [owner, addr1, addr2, ...addrs] = accounts;
  const Dyve = await ethers.getContractFactory("Dyve");
  const Lender = await ethers.getContractFactory("LenderNft");
  dyve = await Dyve.deploy();
  lender = await Lender.deploy();

  await lender.batchMint(10);
});

describe("Dyve", function () {
  it("lists an NFT", async () => {
    const approveTx = await lender.setApprovalForAll(dyve.address, true);
    await approveTx.wait();

    await expect(dyve.list(
      lender.address,
      1,
      ethers.utils.parseEther("1"),
      ethers.utils.parseEther("0.1"),
      100,
    )).to.eventually.not.be.rejected
    const listing = await dyve.listings(1);

    expect(listing.collateral).to.equal(ethers.utils.parseEther("1"));
    expect(listing.fee).to.equal(ethers.utils.parseEther("0.1"));
    expect(listing.nftCollectionAddress).to.equal(lender.address);
    expect(listing.tokenId).to.equal(1);
    expect(listing.duration).to.equal(100);
    expect(listing.lender).to.equal(owner.address);
    expect(listing.status).to.equal(LISTED)
  });

  it("lists an NFT and then it is borrowed to short", async () => {
    const approveTx = await lender.setApprovalForAll(dyve.address, true);
    await approveTx.wait();

    const listTx = await dyve.list(
      lender.address,
      1,
      ethers.utils.parseEther("1"),
      ethers.utils.parseEther("0.1"),
      100,
    )
    await listTx.wait();

    const btsTx = await dyve.connect(addr1).borrowToShort(1, { value: ethers.utils.parseEther("1.1") });
    await btsTx.wait();

    const { timestamp } = await ethers.provider.getBlock(btsTx.blockNumber)
    const listing = await dyve.listings(1);

    expect(listing.borrower).to.equal(addr1.address);
    expect(listing.expiryDateTime).to.equal(timestamp + listing.duration.toNumber())
    expect(listing.status).to.equal(SHORTED)
  })
});
