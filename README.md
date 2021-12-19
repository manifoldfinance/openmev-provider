<span align="center">

# `@openmev/ethers-provider`

[![nodejs](https://github.com/manifoldfinance/openmev-provider/workflows/nodejs/badge.svg)](https://github.com/manifoldfinance/openmev-provider/actions?query=workflow:"nodejs")
[![GitHub tag](https://img.shields.io/github/tag/manifoldfinance/openmev-provider?include_prereleases=&sort=semver&color=blue)](https://github.com/manifoldfinance/openmev-provider/releases/)
[![License](https://img.shields.io/badge/License-Apache--2.0-blue)](#license)
[![issues - openmev-provider](https://img.shields.io/github/issues/manifoldfinance/openmev-provider)](https://github.com/manifoldfinance/openmev-provider/issues)
[![typedoc - latest](https://img.shields.io/badge/typedoc-latest-informational?logo=typescript&logoColor=white)](https://openmev-provider.netlify.app/)

</span>

## Overview

**OpenMEV** provides automated e2e, integration, contract & component (_or
service level_) interfaces and testing utilities.

- ⚡ Automated or Bypass RPC Routing
- 🎈 Lightweight
- 🛠️ Transaction Mock Server
- 🔧 Extendable & Customizable
- 📚 Clear & Comprehensive Documentation
- 🔗 Component, Contract & E2E testing of RPC APIs

This repository contains the `OpenMevBundleProvider` EthersJS provider, an
additional `Provider` to `ethers.js` to enable high-level access to
`eth_sendBundle` and `eth_callBundle`, and `eth_sendMegaBundle` RPC endpoints
for MEV-Geth enabled Mining Pools.

OpenMEV interacts with Flashbots-compliant relays and miners. They expose at
least the following JSON-RPC endpoints:

`eth_sendBundle`, `eth_callBundle`, `eth_sendMegaBundle`

Since these are non-standard endpoints, ethers.js and other libraries do not
natively support these requests (like `getTransactionCount`). In order to
interact with these endpoints, you will need access to another full-featured
(non-OpenMEV) endpoint for nonce-calculation, gas estimation, and transaction
status.

One key feature this library provides is **payload signing**, a requirement to
submit OpenMEV bundles to the `mev-relay` service. This library takes care of
the signing process via the `authSigner` passed into the constructor.
[Read more about relay signatures here via Flashbots](https://github.com/flashbots/mev-relay-js#authentication)

This library is not a fully functional ethers.js implementation, just a simple
provider class, designed to interact with an existing
[ethers.js v5 installation](https://github.com/ethers-io/ethers.js/).

## Example

Install ethers.js and the OpenMev ethers bundle provider

```bash
npm install --save ethers
npm install --save @openmev/ethers-provider
```

Open up a new TypeScript file (this also works with JavaScript if you prefer)

```ts
import { providers, Wallet } from 'ethers';
import { OpenMevBundleProvider } from '@OpenMev/ethers-provider';

// Standard json rpc provider directly from ethers.js (NOT OpenMev)
const provider = new providers.JsonRpcProvider({ url: ETHEREUM_RPC_URL }, 1);

// `authSigner` is an Ethereum private key that does NOT store funds and is NOT your bot's primary key.
// This is an identifying key for signing payloads to establish reputation and whitelisting
// In production, this should be used across multiple bundles to build relationship. In this example, we generate a new wallet each time
const authSigner = Wallet.createRandom();

// OpenMev provider requires passing in a standard provider
const OpenMevProvider = await OpenMevBundleProvider.create(
  provider, // a normal ethers.js provider, to perform gas estimations and nonce lookups
  authSigner, // ethers.js signer wallet, only for signing request payloads, not transactions
);
```

From here, you have a `OpenMevProvider` object setup which can now perform
either an `eth_callBundle` (via `simulate()`) or `eth_sendBundle` (via
`sendBundle`). Each of these functions act on an array of `Bundle Transactions`

### Bundle Transactions

Both `simulate` and `sendBundle` operate on a bundle of strictly-ordered
transactions. While the miner requires signed transactions, the provider library
will accept a mix of pre-signed transaction and `TransactionRequest + Signer`
transactions (which it will estimate, nonce-calculate, and sign before sending
to the `mev-relay`)

```ts
const wallet = new Wallet(PRIVATE_KEY);
const transaction = {
  to: CONTRACT_ADDRESS,
  data: CALL_DATA,
};
const transactionBundle = [
  {
    signedTransaction: SIGNED_ORACLE_UPDATE_FROM_PENDING_POOL, // serialized signed transaction hex
  },
  {
    signer: wallet, // ethers signer
    transaction: transaction, // ethers populated transaction object
  },
];
```

### Block Targeting

The last thing required for `sendBundle()` is block targeting. Every bundle
specifically references a single block. If your bundle is valid for multiple
blocks (including all blocks until it is mined), `sendBundle()` must be called
for every block, ideally on one of the blocks immediately prior. This gives you
a chance to re-evaluate the opportunity you are capturing and re-sign your
transactions with a higher nonce, if necessary.

The block should always be a _future_ block, never the current one.

```ts
const targetBlockNumber = (await provider.getBlockNumber()) + 1;
```

### Gas Prices and EIP-1559

Before EIP-1559 was activated, the most common way for searchers to submit
transactions is with `gasPrice=0`, with an on-chain payment to `block.coinbase`
conditional on the transaction's success. All transactions must pay `baseFee`
now, an attribute of a block. For an example of how to ensure you are using this
`baseFee`, see `demo.ts` in this repository.

```
const block = await provider.getBlock(blockNumber)
const maxBaseFeeInFutureBlock = OpenMevBundleProvider.getMaxBaseFeeInFutureBlock(block.baseFeePerGas, BLOCKS_IN_THE_FUTURE)
const eip1559Transaction = {
    to: wallet.address,
    type: 2,
    maxFeePerGas: PRIORITY_FEE.add(maxBaseFeeInFutureBlock),
    maxPriorityFeePerGas: PRIORITY_FEE,
    gasLimit: 21000,
    data: '0x',
    chainId: CHAIN_ID
}
```

`OpenMevBundleProvider.getMaxBaseFeeInFutureBlock` calculates the maximum
baseFee that is possible `BLOCKS_IN_THE_FUTURE` blocks, given maximum expansion
on each block. You won't pay this fee, so long as it is specified as
`maxFeePerGas`, you will only pay the block's `baseFee`.

### Simulate and Send

Now that we have:

1. OpenMEV Provider `OpenMevProvider`
2. Bundle of transactions `transactionBundle`
3. Block Number `targetBlockNumber`

We can run simulations and submit directly to miners, via the `mev-relay`.

Simulate:

```ts
const signedTransactionBundle = await OpenMevProvider.signBundle(
  transactionBundle,
);
const simulation = await OpenMevProvider.simulate(
  signedTransactions,
  targetBlockNumber,
);
console.log(JSON.stringify(simulation, null, 2));
```

Send:

```ts
const OpenMevTransactionResponse = await OpenMevProvider.sendBundle(
  transactionBundle,
  targetBlockNumber,
);
```

## OpenMev Transaction Response

After calling `sendBundle`, this provider will return a Promise of an object
with helper functions related to the bundle you submitted.

These functions return metadata available at transaction submission time, as
well as the following functions which can wait, track, and simulate the bundle's
behavior.

- `bundleTransactions()` - An array of transaction descriptions sent to the
  relay, including hash, nonce, and the raw transaction.
- `receipts()` - Returns promise of an array of transaction receipts
  corresponding to the transaction hashes that were relayed as part of the
  bundle. Will not wait for block to be mined; could return incomplete
  information
- `wait()` - Returns a promise which will wait for target block number to be
  reached _OR_ one of the transactions to become invalid due to nonce-issues
  (including, but not limited to, one of the transactions from your bundle being
  included too early). Returns the wait resolution as a status enum
- `simulate()` - Returns a promise of the transaction simulation, once the
  proper block height has been reached. Use this function to troubleshoot
  failing bundles and verify miner profitability

## Optional eth_sendBundle arguments

Beyond target block number, an object can be passed in with optional attributes:

```ts
{
  minTimestamp, // optional minimum timestamp at which this bundle is valid (inclusive)
  maxTimestamp, // optional maximum timestamp at which this bundle is valid (inclusive)
  revertingTxHashes: [tx1, tx2] // optional list of transaction hashes allowed to revert. Without specifying here, any revert invalidates the entire bundle.
}
```

### minTimestamp / maxTimestamp

While each bundle targets only a single block, you can add a filter for validity
based on the block's timestamp. This does _not_ allow for targeting any block
number based on a timestamp or instruct miners on what timestamp to use, it
merely serves as a secondary filter.

If your bundle is not valid before a certain time or includes an expiring
opportunity, setting these values allows the miner to skip bundle processing
earlier in the phase.

Additionally, you could target several blocks in the future, but with a strict
maxTimestamp, to ensure your bundle is considered for inclusion up to a specific
time, regardless of how quickly blocks are mined in that timeframe.

### Reverting Transaction Hashes

Transaction bundles will not be considered for inclusion if they include _any_
transactions that revert or fail. While this is normally desirable, there are
some advanced use-cases where a searcher might WANT to bring a failing
transaction to the chain. This is normally desirable for nonce management.
Consider:

Transaction Nonce #1 = Failed (unrelated) token transfer Transaction Nonce #2 =
DEX trade

If a searcher wants to bring #2 to the chain, #1 must be included first, and its
failure is not related to the desired transaction #2. This is especially common
during high gas times.

Optional parameter `revertingTxHashes` allows a searcher to specify an array of
transactions that can (but are not required to) revert.

## Paying for your bundle

In addition to paying for a bundle with gas price, bundles can also
conditionally pay a miner via: `block.coinbase.transfer(_minerReward)` or
`block.coinbase.call{value: _minerReward}("");`

(assuming \_minerReward is a solidity `uint256` with the wei-value to be
transferred directly to the miner)

The entire value of the bundle is added up at the end, so not every transaction
needs to have a gas price or `block.coinbase` payment, so long as at least one
does, and pays enough to support the gas used in non-paying transactions.

Note: Gas-fees will ONLY benefit your bundle if the transaction is not already
present in the mempool. When including a pending transaction in your bundle, it
is similar to that transaction having a gas price of `0`; other transactions in
your bundle will need to pay more for the gas it uses.

## Bundle and User Statistics

The OpenMEV relay can also return statistics about you as a user (identified
solely by your signing address) and any bundle previously submitted.

- `getUserStats()` returns aggregate metrics about past performance
- `getBundleStats(bundleHash, targetBlockNumber)` returns data specific to a
  single bundle submission, including detailed timestamps for the various phases
  a bundle goes before reaching miners.

## Testnetwork Example: Goerli

> Note that OpenMEV does not operate on Goerli, this is via flashbots 

To test OpenMEV before going to mainnet, you can use the Goerli Flashbots relay,
which works in conjunction with a OpenMEV-enabled Goerli validator. Running a compatible OpenMEV client on
Goerli requires two simple changes:

1. Ensure your genericProvider passed in to the `OpenMevBundleProvider` / `FlashbotsBundleProvider`
   constructor is connected to Goerli (gas estimates and nonce requests need to
   correspond to the correct chain):

```ts
import { providers } from 'ethers';
const provider = providers.getDefaultProvider('goerli');
```

2. Set the relay endpoint to `https://testnet.flashbots.net/`

```ts
const OpenMevProvider = await OpenMevBundleProvider.create(
  provider,
  authSigner,
  'https://testnet.flashbots.net/',
  'goerli',
);
```

## License

Apache-2.0
