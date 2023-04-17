require('dotenv').config()
require("@nomicfoundation/hardhat-toolbox");
require("solidity-coverage");
require("hardhat-gas-reporter");
require("hardhat-dependency-compiler");
require("@nomiclabs/hardhat-etherscan");

// Gas estimation calculation
// (gas units) * (gas price per unit) = gas fee in gwei

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    compilers: [
      { version: "0.8.16" }, 
      { version: "0.8.9" }, 
      { version: "0.8.0" }, 
      { version: "0.4.18" }
    ]
  },
  paths: {
    artifacts: './artifacts'
  },
  gasReporter: {
    enabled: true,
    currency: 'USD',
    coinmarketcap: process.env.COINMARKET_CAP_API_KEY,
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY
  },
  // dependencyCompiler: {
  //   paths: [
  //     './ProtocolFeeManager.sol',
  //     './ReservoirOracle.sol',
  //     './WhitelistedCurrencies.sol',
  //   ],
  // },
  networks: {
    mainnet: {
      url: `https://eth-mainnet.g.alchemy.com/v2/${process.env.MAINNET_ALCHEMY_API_KEY}`,
      accounts: process.env.PRIVATE_KEY_LISTER !== undefined
        ? [process.env.PRIVATE_KEY_LISTER, process.env.PRIVATE_KEY_BIDDER]
        : [],
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
