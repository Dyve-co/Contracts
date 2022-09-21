const hre = require("hardhat");

async function main() {
  const Lender = await hre.ethers.getContractFactory("LenderNft");
  const lender = await Lender.attach(process.env.LENDER_ADDRESS);

  for (const i of [...Array(10).keys()]) {
    tx = await lender.mint()
    await tx.wait()
    console.log("minted: ", i)
  }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
