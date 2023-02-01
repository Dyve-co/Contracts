
const { expect, use } = require("chai")
const { ethers } = require("hardhat")
use(require('chai-as-promised'))

let accounts, owner, addr1, addr2, addrs;
let moonBird, boredApe, doodles;

beforeEach(async function () {
  accounts = await ethers.getSigners(); 
  [owner, addr1, addr2, ...addrs] = accounts;
  reservoirOracleSigner = owner;
  protocolFeeRecipient = addr2;

  const MoonBird = await ethers.getContractFactory('MockERC721')
  moonBird = await MoonBird.deploy('MoonBird', 'MOONBIRD', 'https://live---metadata-5covpqijaa-uc.a.run.app/metadata/')

  const BoredApe = ethers.getContractFactory('MockERC721')
  boredApe = await MoonBird.deploy('BoredApe', 'BOREDAPE', 'https://bafybeihpjhkeuiq3k6nqa3fkgeigeri7iebtrsuyuey5y6vy36n345xmbi.ipfs.dweb.link/')

  const Doodles = ethers.getContractFactory('MockERC721')
  doodles = await MoonBird.deploy('Doodles', 'DOODLE', 'https://bafybeiapdjd6fxbbbv5h5dsmc7dtfjxahqltarc3vf6n2m7axddpatfph4.ipfs.dweb.link/')
});

describe("Dyve", function () {
  describe("Checks tokenURI", function () {
    it("checks initial properties were set correctly", async () => {

      const mintMoonBirdTx = await moonBird.batchMint(5);
      await mintMoonBirdTx.wait()

      const mintBoredApeTx = await boredApe.batchMint(5);
      await mintBoredApeTx.wait()

      const mintDoodlesTx = await doodles.batchMint(5);
      await mintDoodlesTx.wait()

      const moonBirdTokenURI = await moonBird.tokenURI(4);
      console.log("tokenURI: ", moonBirdTokenURI)

      const boredApeTokenURI = await boredApe.tokenURI(4);
      console.log("tokenURI: ", boredApeTokenURI)

      const doodlesTokenURI = await doodles.tokenURI(4);
      console.log("tokenURI: ", doodlesTokenURI)
    })
  })
})
