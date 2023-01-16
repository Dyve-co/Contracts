module.exports = {
  Order: [
    { name: "orderType", type: "uint256" },
    { name: "signer", type: "address" },
    { name: "collection", type: "address" },
    { name: "tokenId", type: "uint256" },
    { name: "duration", type: "uint256" },
    { name: "collateral", type: "uint256" },
    { name: "fee", type: "uint256" },
    { name: "currency", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "startTime", type: "uint256" },
    { name: "endTime", type: "uint256" },
  ]
}
