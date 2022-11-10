module.exports = {
  MakerOrder: [
    { name: "isOrderAsk", type: "bool" },
    { name: "signer", type: "address" },
    { name: "collection", type: "address" },
    { name: "tokenId", type: "uint256" },
    { name: "duration", type: "uint256" },
    { name: "collateral", type: "uint256" },
    { name: "fee", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "startTime", type: "uint256" },
    { name: "endTime", type: "uint256" },
  ]
}
