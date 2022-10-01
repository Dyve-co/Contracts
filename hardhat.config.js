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
