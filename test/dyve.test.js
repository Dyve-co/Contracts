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
let escrow;
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

  const Escrow = await ethers.getContractFactory("Escrow");
  escrow = await Escrow.deploy();
  await escrow.deployed();

  const Dyve = await ethers.getContractFactory("Dyve");
  dyve = await Dyve.deploy(escrow.address);

  const Lender = await ethers.getContractFactory("LenderNft");
  lender = await Lender.deploy();

  await lender.batchMint(10);
});

describe("Dyve", function () {
  it("lists an NFT", async () => {
    const approveTx = await lender.setApprovalForAll(dyve.address, true);
    await approveTx.wait();

    const listTx = await dyve.list(
      lender.address,
      1,
      ethers.utils.parseEther("1"),
      ethers.utils.parseEther("0.1"),
      100,
    );
    await listTx.wait();
    const listing = await dyve.listings(1);
    
    expect(lender.ownerOf(1)).to.eventually.equal(dyve.address);
    expect(listing.collateral).to.equal(ethers.utils.parseEther("1"));
    expect(listing.fee).to.equal(ethers.utils.parseEther("0.1"));
    expect(listing.collection).to.equal(lender.address);
    expect(listing.tokenId).to.equal(1);
    expect(listing.duration).to.equal(100);
    expect(listing.lender).to.equal(owner.address);
    expect(listing.status).to.equal(LISTED);
  });

  it("lists an NFT and then it is borrowed", async () => {
    const approveTx = await lender.setApprovalForAll(dyve.address, true);
    await approveTx.wait();

    const listTx = await dyve.list(
      lender.address,
      1,
      ethers.utils.parseEther("1"),
      ethers.utils.parseEther("0.1"),
      100,
    );
    await listTx.wait();

    const borrowTx = await dyve.connect(addr1).borrow(1, { value: ethers.utils.parseEther("1.1") });
    await borrowTx.wait();

    const { timestamp } = await ethers.provider.getBlock(borrowTx.blockNumber)
    const listing = await dyve.listings(1);
    
    expect(lender.ownerOf(1)).to.eventually.equal(addr1.address);
    await expect(() => borrowTx).to.changeEtherBalance(escrow, ethers.utils.parseEther("1"))
    expect(listing.borrower).to.equal(addr1.address);
    expect(listing.expiryDateTime).to.equal(timestamp + listing.duration.toNumber())
    expect(listing.status).to.equal(SHORTED)
  })
});
