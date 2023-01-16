const { expect, use } = require("chai")
const { ethers } = require("hardhat")
const axios = require('axios')
use(require('chai-as-promised'))

const { solidityKeccak256, keccak256, defaultAbiCoder } = ethers.utils;

describe("Oracle", function () {
  it("Tests out the relative floor price oracle", async () => {
    const Oracle = await ethers.getContractFactory("Oracle")
    const oracle = await Oracle.deploy()
    await oracle.deployed()

    const options = {
      method: 'GET',
      url: 'https://api-goerli.reservoir.tools/oracle/collections/floor-ask/v4?collection=0xc963CaC86C0Acabe5450df56d3Fa7a26DA981D53',
      headers: {accept: '*/*', 'x-api-key': 'dyve-api-key'}
    };

    const { message } = (await axios.request(options)).data
    console.log("message: ", message.signature.length)

    const tx = await oracle.checkMessage(message)
    console.log("tx: ", tx)
  })
})
