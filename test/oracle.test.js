const { expect, use } = require("chai")
const { ethers } = require("hardhat")
const axios = require('axios')
const { setup, tokenSetup, generateSignature, computeOrderHash } = require("./helpers");
const { isCallTrace } = require("hardhat/internal/hardhat-network/stack-traces/message-trace");
use(require('chai-as-promised'))

const { solidityKeccak256, arrayify, keccak256, defaultAbiCoder } = ethers.utils;

const message = {
  token: "0x59468516a8259058baD1cA5F8f4BFF190d30E066:9",
  isFlagged: false,
  lastTransferTime: 1674444275,
  message: {
    id: "0x8e5323914f3bb05b0f513e72bec1e37085f6b5bd23fbf95400d097feddd09141",
    payload: "0x00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000063cdfdf3",
    timestamp: 1674541103,
    signature: "0x3bb3cca883a5ce531ececb000bd7775846133b13640e303632ee249fe118750c52bf94533da55f25dcd3c828b6327c3b167d1fc8a3f1a90aad82306dee5f1dfe1b"
  }
}

describe("Dyve", function () {
  it("test", async () => {
    const [signer] = await ethers.getSigners()
    const payload = defaultAbiCoder.encode(['bool', 'uint256'], [message.isFlagged, message.lastTransferTime])

    const Oracle = await ethers.getContractFactory("Oracle")
    const oracle = await Oracle.deploy(signer.address)

    const messageHash = solidityKeccak256(
      ["bytes32", "bytes32", "bytes", "uint256"],
      [
        solidityKeccak256(['string'], ["Message(bytes32 id,bytes payload,uint256 timestamp)"]),
        message.message.id,
        solidityKeccak256(['bytes'], [payload]),
        // payload
        message.message.timestamp
      ]
    )
    const messageHashBinary = arrayify(messageHash)
    // console.log("message hash binary: ", messageHashBinary)

    const signature = await signer.signMessage(messageHashBinary)
    // console.log("signature made: ", signature)

    const addressReturned = await oracle.verifyMessage({ ...message.message, signature })
    console.log("address returned: ", addressReturned)
    console.log("signer address: ", signer.address)
  })
})