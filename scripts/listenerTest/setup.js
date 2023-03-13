const hre = require("hardhat");
const { setup, tokenSetup, generateSignature, computeOrderHash, constructMessage } = require("../../test/helpers")
const fs = require('fs')

async function main() {
  accounts = await ethers.getSigners(); 
  [owner, addr1, addr2, ...addrs] = accounts;
  reservoirOracleSigner = owner;
  protocolFeeRecipient = addr2;

  await hre.network.provider.send('hardhat_reset')
  const [weth, mockUSDC, mockERC721, mockERC1155, premiumCollection, whitelistedCurrencies, reservoirOracle, protocolFeeManager, dyve] = await setup(protocolFeeRecipient, reservoirOracleSigner)
  await tokenSetup([owner, addr1, addr2], weth, mockUSDC, mockERC721, mockERC1155, premiumCollection, whitelistedCurrencies, protocolFeeManager, dyve)

  console.log("mock ERC721 deployed: ", mockERC721.address)
  console.log("dyve deployed: ", dyve.address)

  const s = {
    ETH_TO_ERC721: 0,
    ETH_TO_ERC1155: 1,
    ERC20_TO_ERC721: 2,
    ERC20_TO_ERC1155: 3,
    ERC721_TO_ERC20: 4,
    ERC1155_TO_ERC20: 5,
    EMPTY: 0,
    BORROWED: 1,
    EXPIRED: 2,
    CLOSED: 3,
    owner: { address: owner.address, },
    addr1: { address: addr1.address },
    addr2: { address: addr2.address },
    reservoirOracleSigner: { address: reservoirOracleSigner.address },
    dyve: { address: dyve.address },
    mockERC721: { address: mockERC721.address },
  }

  const setupString = JSON.stringify(s)
  fs.writeFileSync('./setup.json', setupString)
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});