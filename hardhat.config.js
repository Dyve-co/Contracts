require('dotenv').config()
require("@nomicfoundation/hardhat-toolbox");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    compilers: [
      { version: "0.8.9" }, 
      { version: "0.4.18" }
    ]
  },
  paths: {
    artifacts: './artifacts'
  },
  networks: {
    localhost: {
      accounts: [
        '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
        '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
      ]
    },
    rinkeby: {
      url: `https://eth-rinkeby.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
      accounts: process.env.PRIVATE_KEY_LISTER !== undefined 
        ? [process.env.PRIVATE_KEY_LISTER, process.env.PRIVATE_KEY_BIDDER] 
        : [],
    },
    goerli: {
      url: `https://eth-goerli.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
      accounts: process.env.PRIVATE_KEY_LISTER !== undefined 
        ? [process.env.PRIVATE_KEY_LISTER, process.env.PRIVATE_KEY_BIDDER]
        : [],
    }
  }
}
