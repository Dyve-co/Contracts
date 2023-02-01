const hre = require("hardhat");

async function main() {
  const MockERC721 = await ethers.getContractFactory('MockERC721')

  const moonBird = await MockERC721.deploy('MoonBird', 'MOONBIRD', 'https://live---metadata-5covpqijaa-uc.a.run.app/metadata/')
  console.log("mock moon bird collection deployed: ", moonBird.address)

  const boredApe = await MockERC721.deploy('BoredApe', 'BOREDAPE', 'https://bafybeihpjhkeuiq3k6nqa3fkgeigeri7iebtrsuyuey5y6vy36n345xmbi.ipfs.dweb.link/')
  console.log("mock bored ape collection deployed: ", boredApe.address)

  doodles = await MockERC721.deploy('Doodles', 'DOODLE', 'https://bafybeiapdjd6fxbbbv5h5dsmc7dtfjxahqltarc3vf6n2m7axddpatfph4.ipfs.dweb.link/')
  console.log("mock doodles collection deployed: ", doodles.address)

  // const mintMoonBirdTx = await moonBird.batchMint(5);
  // await mintMoonBirdTx.wait()
  // console.log("minted 5 moon birds")

  // const mintBoredApeTx = await boredApe.batchMint(5);
  // await mintBoredApeTx.wait()
  // console.log("minted 5 bored apes")

  // const mintDoodlesTx = await doodles.batchMint(5);
  // await mintDoodlesTx.wait()
  // console.log("minted 5 doodles")
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

