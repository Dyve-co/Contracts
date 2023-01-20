
const orderType = {
  Order: [
    { name: "orderType", type: "uint256" },
    { name: "signer", type: "address" },
    { name: "collection", type: "address" },
    { name: "tokenId", type: "uint256" },
    { name: "amount", type: "uint256" },
    { name: "duration", type: "uint256" },
    { name: "collateral", type: "uint256" },
    { name: "fee", type: "uint256" },
    { name: "currency", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "startTime", type: "uint256" },
    { name: "endTime", type: "uint256" },
  ]
}

const messageType = {
  Message: [
    { name: 'id', type: 'bytes32' },
    { name: 'payload', type: 'bytes' },
    { name: 'timestamp', type: 'uint256' },
  ]
}

module.exports = { orderType, messageType }
