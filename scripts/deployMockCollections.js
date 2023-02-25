const hre = require("hardhat");

async function main() {
  const MockERC721 = await ethers.getContractFactory('MockERC721')
  const MockERC1155 = await ethers.getContractFactory('MockERC1155')

  const goblinTown = await MockERC721.deploy('goblintown', 'GOBLIN', 'https://bafybeihh7nkgvkhgiu2jvr5tydw4jnawwk7lctrwypbby6rch7clgc6xdu.ipfs.dweb.link/')
  console.log("mock goblin town collection deployed: ", goblinTown.address)

  const boredApe = await MockERC721.deploy('BoredApeYachtClub', 'BAYC', 'https://bafybeihpjhkeuiq3k6nqa3fkgeigeri7iebtrsuyuey5y6vy36n345xmbi.ipfs.dweb.link/')
  console.log("mock bored ape collection deployed: ", boredApe.address)

  const doodles = await MockERC721.deploy('Doodles', 'DOODLE', 'https://bafybeiapdjd6fxbbbv5h5dsmc7dtfjxahqltarc3vf6n2m7axddpatfph4.ipfs.dweb.link/')
  console.log("mock doodles collection deployed: ", doodles.address)

  const nyanCat = await MockERC1155.deploy('Nyan Cat', 'NYAN', 'https://gateway.pinata.cloud/ipfs/QmUbYfuTGNpNfFdMzSmkSVZxC5iGhaDpcR8YH8gJgDb2xo/{id}.json')
  console.log("mock Nyan Cat collection deployed: ", nyanCat.address)
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

