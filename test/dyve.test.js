const { expect, use } = require("chai")
const { ethers } = require("hardhat")
const { getOracleFloorPrice } = require("./reservoir-sandbox")
const axios = require("axios")
const queryString = require('query-string')
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

// beforeEach(async function () {
//   accounts = await ethers.getSigners(); 
//   [owner, addr1, addr2, ...addrs] = accounts;

//   const Escrow = await ethers.getContractFactory("Escrow");
//   escrow = await Escrow.deploy();
//   await escrow.deployed();

//   const Dyve = await ethers.getContractFactory("Dyve");
//   dyve = await Dyve.deploy(escrow.address);

//   const Lender = await ethers.getContractFactory("LenderNft");
//   lender = await Lender.deploy();

//   await lender.batchMint(10);
// });

// beforeEach(async function () {
//   accounts = await ethers.getSigners(); 
//   [owner, addr1, addr2, ...addrs] = accounts;

//   const Dyve = await ethers.getContractFactory("Asd");
//   // dyve = await Dyve.attach("");
//   dyve = await Dyve.deploy();
//   await dyve.deployed();
//   console.log("dyve deployed: ", dyve.address);
// });

describe("Dyve", function () {
  it.only("asd", async () => {
    const Test = await ethers.getContractFactory("Test");
    test = await Test.deploy();
    await test.deployed();

    const query = queryString.stringify({
      kind: 'upper',
      twapSeconds: 86400,
    })

    const collectionAddress = "0x8898883e010463a0d8b78ca33ee085b73f419755"
    const { data: { message } } = await axios({
      url: `https://api-goerli.reservoir.tools/oracle/collections/${collectionAddress}/floor-ask/v3?${query}`,
      method: 'GET', 
      headers: {accept: '*/*', 'x-api-key': 'dyve-api-key'}
    })
    console.log("message test: ", message)

    const tx = await test.oracle(message)
    await tx.wait()
  })

  it("reservoir oracle test", async () => {
    const { price: floorPrice, message } = await getOracleFloorPrice("0x8898883e010463a0d8b78ca33ee085b73f419755")
    console.log("message: ", message)
    const tx = await dyve.oracle(message)
    const receipt = await tx.wait()
    console.log("event: ", receipt.events)
  })

  it("lists an NFT", async () => {
    const approveTx = await lender.setApprovalForAll(dyve.address, true);
    await approveTx.wait();

    const listTx = await dyve.list(
      lender.address,
      1,
      ethers.utils.parseEther("1"),
      150,
      ethers.utils.parseEther("0.1"),
      100,
    );
    await listTx.wait();
    const listing = await dyve.listings(1);
    
    expect(lender.ownerOf(1)).to.eventually.equal(dyve.address);
    expect(listing.collateral).to.equal(0);
    expect(listing.baseCollateral).to.equal(ethers.utils.parseEther("1"));
    expect(listing.collateralMultiplier).to.equal(150);
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
      400,
      ethers.utils.parseEther("0.1"),
      100,
    );
    await listTx.wait();

    const oracleCollectionFloor = {
      "price": 0.4,
      "message": {
        "id": "0x09dfc3aac7fe8d7a036987504f26ff511fde697a4d79054cddc51f34206fa461",
        "payload": "0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000058d15e176280000",
        "timestamp": 1666413863,
        "signature": "0xd479e272d26526ca91413ddee9a5615b4b370c6d70862c29f1a54992ba1342130607d4f20ab62c610fd619dfcf2b8a39b21402fe20bcba8f17f4d7a23ba46ba81b"
      },
      "data": "0x000000000000000000000000000000000000000000000000000000000000002009dfc3aac7fe8d7a036987504f26ff511fde697a4d79054cddc51f34206fa4610000000000000000000000000000000000000000000000000000000000000080000000000000000000000000000000000000000000000000000000006353752700000000000000000000000000000000000000000000000000000000000000e000000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000058d15e1762800000000000000000000000000000000000000000000000000000000000000000041d479e272d26526ca91413ddee9a5615b4b370c6d70862c29f1a54992ba1342130607d4f20ab62c610fd619dfcf2b8a39b21402fe20bcba8f17f4d7a23ba46ba81b00000000000000000000000000000000000000000000000000000000000000"
    }

    const borrowTx = await dyve.connect(addr1).borrow(
      1,
      oracleCollectionFloor.message,
      { value: ethers.utils.parseEther("1.7") }
    );
    await borrowTx.wait();

    const { timestamp } = await ethers.provider.getBlock(borrowTx.blockNumber)
    const listing = await dyve.listings(1);
    
    expect(lender.ownerOf(1)).to.eventually.equal(addr1.address);
    await expect(() => borrowTx).to.changeEtherBalance(escrow, ethers.utils.parseEther("1.6"))
    expect(listing.borrower).to.equal(addr1.address);
    expect(listing.collateral).to.equal(ethers.utils.parseEther("1.6"));
    expect(listing.expiryDateTime).to.equal(timestamp + listing.duration.toNumber())
    expect(listing.status).to.equal(SHORTED)
  })
});
