const { expect, use } = require("chai")
const { ethers } = require("hardhat")
use(require('chai-as-promised'))

function range(size, startAt = 0) {
  return [...Array(size).keys()].map(i => i + startAt);
}

let accounts;
let whiteRabbit;
let owner;
let addr1;
let addr2;
let addrs;
let whitelisted;
let notWhitelisted;
let merkleRoot;
let addresses;
let tree;

beforeEach(async function () {
  accounts = await ethers.getSigners(); 
  [owner, addr1, addr2, ...addrs] = accounts;

  const Dyve = await ethers.getContractFactory("Dyve");
  dyve = await Dyve.deploy();
  await whiteRabbit.setWhitelistMerkleProof(merkleRoot);
});

