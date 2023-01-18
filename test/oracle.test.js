const { expect, use } = require("chai")
const { ethers } = require("hardhat")
const axios = require('axios')
const { generateOracleSignature } = require('./helpers')
use(require('chai-as-promised'))

const { solidityKeccak256, keccak256, defaultAbiCoder } = ethers.utils;

describe("Oracle", function () {
  it("Tests out the relative floor price oracle", async () => {
    [owner] = await ethers.getSigners(); 
    const signerAddress = await owner.getAddress()
    console.log("signer address in test: ", signerAddress)

    const Oracle = await ethers.getContractFactory("Oracle")
    const oracle = await Oracle.deploy(signerAddress)
    await oracle.deployed()


    const payload = defaultAbiCoder.encode(['bool', 'uint'], [false, 1673603412])
    console.log('payload: ', payload)
    const now = Math.floor(Date.now() / 1000) + 10000
    // const data = { 
    //   id: '0xc73c1983c576cdcde0131326599ae27c03d0f0ad01e2dbdcb8b7ce9ee83a1ea7', 
    //   payload,
    //   timestamp: now + 1000
    // }
    const data = {
      id: '0xc73c1983c576cdcde0131326599ae27c03d0f0ad01e2dbdcb8b7ce9ee83a1ea7',
      payload,
      timestamp: 1641983065,
    }
    const signature = await generateOracleSignature(data, owner)
    const message = { ...data, signature }

    // set timestamp
    await network.provider.send("evm_setNextBlockTimestamp", [now])
    await network.provider.send("evm_mine")

    const tx = await oracle.checkMessage(message)
    console.log("tx: ", tx)
  })
})
