"use strict";
/**
 * @package @openmev/ethers-provider
 * @version 1.2.0
 * @since 2021.12
 * @license Apache-2.0
 * @see {@link https://docs.openmev.org}
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenMevBundleProvider = exports.OpenMevBundleResolution = exports.BundleSourceId = exports.systemConfigIdToJSON = exports.systemConfigIdFromJSON = exports.SystemConfigId = exports.DEFAULT_OPENMEV_ENDPOINT_PROVIDER = exports.DEFAULT_SUSHIRELAY_ENDPOINT = exports.DEFAULT_OPENMEV_ENDPOINT = exports.DEFAULT_EDENNETWORK_ENDPOINT = exports.DEFAULT_ETHERMINE_ENDPOINT = exports.DEFAULT_FLASHBOTS_ENDPOINT = exports.DEFAULT_FLASHBOTS_RPC_ENDPOINT = exports.DEFAULT_FLASHBOTS_RELAY_ENDPOINT = exports.id = void 0;
const tslib_1 = require("tslib");
const web_1 = require("@ethersproject/web");
// import { BigNumber, ethers, providers, Signer } from 'ethers'
const keccak256_1 = require("@ethersproject/keccak256");
const providers = (0, tslib_1.__importStar)(require("@ethersproject/providers"));
const bignumber_1 = require("@ethersproject/bignumber");
const transactions_1 = require("@ethersproject/transactions");
const strings_1 = require("@ethersproject/strings");
const eciesjs_1 = require("eciesjs");
const rlp_1 = require("@ethersproject/rlp");
const units_1 = require("@ethersproject/units");
function id(text) {
    return (0, keccak256_1.keccak256)((0, strings_1.toUtf8Bytes)(text));
}
exports.id = id;
exports.DEFAULT_FLASHBOTS_RELAY_ENDPOINT = 'https://relay.flashbots.net';
exports.DEFAULT_FLASHBOTS_RPC_ENDPOINT = 'https://rpc.flashbots.net';
exports.DEFAULT_FLASHBOTS_ENDPOINT = exports.DEFAULT_FLASHBOTS_RELAY_ENDPOINT;
exports.DEFAULT_ETHERMINE_ENDPOINT = 'https://mev-relay.ethermine.org/';
exports.DEFAULT_EDENNETWORK_ENDPOINT = 'https://api.edennetwork.io/v1/rpc';
exports.DEFAULT_OPENMEV_ENDPOINT = 'https://mainnet.eth.openmev.org/v1';
exports.DEFAULT_SUSHIRELAY_ENDPOINT = 'https://api.sushirelay.com/v1';
exports.DEFAULT_OPENMEV_ENDPOINT_PROVIDER = exports.DEFAULT_SUSHIRELAY_ENDPOINT;
var SystemConfigId;
(function (SystemConfigId) {
    SystemConfigId[SystemConfigId["CONFIG_MINER_RELAY"] = 0] = "CONFIG_MINER_RELAY";
    SystemConfigId[SystemConfigId["UNRECOGNIZED"] = -1] = "UNRECOGNIZED";
})(SystemConfigId = exports.SystemConfigId || (exports.SystemConfigId = {}));
function systemConfigIdFromJSON(object) {
    switch (object) {
        case 0:
        case 'CONFIG_MINER_RELAY':
            return SystemConfigId.CONFIG_MINER_RELAY;
        case -1:
        case 'UNRECOGNIZED':
        default:
            return SystemConfigId.UNRECOGNIZED;
    }
}
exports.systemConfigIdFromJSON = systemConfigIdFromJSON;
function systemConfigIdToJSON(object) {
    switch (object) {
        case SystemConfigId.CONFIG_MINER_RELAY:
            return 'CONFIG_MINER_RELAY';
        default:
            return 'UNKNOWN';
    }
}
exports.systemConfigIdToJSON = systemConfigIdToJSON;
// @TODO add additional SourceIds
//    openmev, keeper, secret
var BundleSourceId;
(function (BundleSourceId) {
    BundleSourceId[BundleSourceId["BATCH_BUNDLER"] = 0] = "BATCH_BUNDLER";
    BundleSourceId[BundleSourceId["KDB"] = 1] = "KDB";
    BundleSourceId[BundleSourceId["UNREC"] = 2] = "UNREC";
})(BundleSourceId = exports.BundleSourceId || (exports.BundleSourceId = {}));
var OpenMevBundleResolution;
(function (OpenMevBundleResolution) {
    OpenMevBundleResolution[OpenMevBundleResolution["BundleIncluded"] = 0] = "BundleIncluded";
    OpenMevBundleResolution[OpenMevBundleResolution["BlockPassedWithoutInclusion"] = 1] = "BlockPassedWithoutInclusion";
    OpenMevBundleResolution[OpenMevBundleResolution["AccountNonceTooHigh"] = 2] = "AccountNonceTooHigh";
})(OpenMevBundleResolution = exports.OpenMevBundleResolution || (exports.OpenMevBundleResolution = {}));
const TIMEOUT_MS = 5 * 60 * 1000;
class OpenMevBundleProvider extends providers.JsonRpcProvider {
    constructor(genericProvider, authSigner, connectionInfoOrUrl, network) {
        super(connectionInfoOrUrl, network);
        this.genericProvider = genericProvider;
        this.authSigner = authSigner;
        this.connectionInfo = connectionInfoOrUrl;
    }
    static async throttleCallback() {
        console.warn('🆘 Warning: Rate limited');
        return false;
    }
    static async create(genericProvider, authSigner, connectionInfoOrUrl, network) {
        const connectionInfo = typeof connectionInfoOrUrl === 'string' ||
            typeof connectionInfoOrUrl === 'undefined'
            ? {
                url: connectionInfoOrUrl || exports.DEFAULT_OPENMEV_ENDPOINT_PROVIDER,
            }
            : {
                ...connectionInfoOrUrl,
            };
        if (connectionInfo.headers === undefined)
            connectionInfo.headers = {};
        connectionInfo.throttleCallback = OpenMevBundleProvider.throttleCallback;
        const networkish = {
            chainId: 0,
            name: '',
        };
        if (typeof network === 'string') {
            networkish.name = network;
        }
        else if (typeof network === 'number') {
            networkish.chainId = network;
        }
        else if (typeof network === 'object') {
            networkish.name = network.name;
            networkish.chainId = network.chainId;
        }
        if (networkish.chainId === 0) {
            networkish.chainId = (await genericProvider.getNetwork()).chainId;
        }
        return new OpenMevBundleProvider(genericProvider, authSigner, connectionInfo, networkish);
    }
    static getMaxBaseFeeInFutureBlock(baseFee, blocksInFuture) {
        let maxBaseFee = bignumber_1.BigNumber.from(baseFee);
        for (let i = 0; i < blocksInFuture; i++) {
            maxBaseFee = maxBaseFee.mul(1125).div(1000).add(1);
        }
        return maxBaseFee;
    }
    async sendRawBundle(signedBundledTransactions, targetBlockNumber, opts) {
        const params = {
            txs: signedBundledTransactions,
            blockNumber: `0x${targetBlockNumber.toString(16)}`,
            minTimestamp: opts === null || opts === void 0 ? void 0 : opts.minTimestamp,
            maxTimestamp: opts === null || opts === void 0 ? void 0 : opts.maxTimestamp,
            revertingTxHashes: opts === null || opts === void 0 ? void 0 : opts.revertingTxHashes,
        };
        const request = JSON.stringify(this.prepareBundleRequest('eth_sendBundle', [params]));
        const response = await this.request(request);
        if (response.error !== undefined && response.error !== null) {
            return {
                error: {
                    message: response.error.message,
                    code: response.error.code,
                },
            };
        }
        const bundleTransactions = signedBundledTransactions.map((signedTransaction) => {
            const transactionDetails = (0, transactions_1.parse)(signedTransaction);
            return {
                signedTransaction,
                hash: (0, keccak256_1.keccak256)(signedTransaction),
                account: transactionDetails.from || '0x0',
                nonce: transactionDetails.nonce,
            };
        });
        return {
            bundleTransactions,
            wait: () => this.wait(bundleTransactions, targetBlockNumber, TIMEOUT_MS),
            simulate: () => this.simulate(bundleTransactions.map((tx) => tx.signedTransaction), targetBlockNumber, undefined, opts === null || opts === void 0 ? void 0 : opts.minTimestamp),
            receipts: () => this.fetchReceipts(bundleTransactions),
        };
    }
    async sendBundle(bundledTransactions, targetBlockNumber, opts) {
        const signedTransactions = await this.signBundle(bundledTransactions);
        return this.sendRawBundle(signedTransactions, targetBlockNumber, opts);
    }
    async signBundle(bundledTransactions) {
        const nonces = {};
        const signedTransactions = new Array();
        for (const tx of bundledTransactions) {
            if ('signedTransaction' in tx) {
                /** @note In case someone is mixing pre-signed and signing transactions, decode to add to nonce object */
                const transactionDetails = (0, transactions_1.parse)(tx.signedTransaction);
                if (transactionDetails.from === undefined)
                    throw new Error('❌ Error: unable to decode signed transaction');
                console.log(Error);
                nonces[transactionDetails.from] = bignumber_1.BigNumber.from(transactionDetails.nonce + 1);
                signedTransactions.push(tx.signedTransaction);
                continue;
            }
            const transaction = { ...tx.transaction };
            const address = await tx.signer.getAddress();
            if (typeof transaction.nonce === 'string')
                throw new Error('❌ Error: Bad nonce');
            console.log(Error);
            const nonce = transaction.nonce !== undefined
                ? bignumber_1.BigNumber.from(transaction.nonce)
                : nonces[address] ||
                    bignumber_1.BigNumber.from(await this.genericProvider.getTransactionCount(address, 'latest'));
            nonces[address] = nonce.add(1);
            if (transaction.nonce === undefined)
                transaction.nonce = nonce;
            if ((transaction.type == null || transaction.type == 0) &&
                transaction.gasPrice === undefined)
                transaction.gasPrice = bignumber_1.BigNumber.from(0);
            if (transaction.gasLimit === undefined)
                transaction.gasLimit = await tx.signer.estimateGas(transaction); // TODO: Add target block number and timestamp when supported by geth
            signedTransactions.push(await tx.signer.signTransaction(transaction));
        }
        return signedTransactions;
    }
    wait(transactionAccountNonces, targetBlockNumber, timeout) {
        return new Promise((resolve, reject) => {
            let timer = null;
            let done = false;
            const minimumNonceByAccount = transactionAccountNonces.reduce((acc, accountNonce) => {
                if (accountNonce.nonce > 0 &&
                    (accountNonce.nonce || 0) < acc[accountNonce.account]) {
                    acc[accountNonce.account] = accountNonce.nonce;
                }
                acc[accountNonce.account] = accountNonce.nonce;
                return acc;
            }, {});
            const handler = async (blockNumber) => {
                if (blockNumber < targetBlockNumber) {
                    const noncesValid = await Promise.all(Object.entries(minimumNonceByAccount).map(async ([account, nonce]) => {
                        const transactionCount = await this.genericProvider.getTransactionCount(account);
                        return nonce >= transactionCount;
                    }));
                    const allNoncesValid = noncesValid.every(Boolean);
                    if (allNoncesValid)
                        return;
                    // target block not yet reached, but nonce has become invalid
                    resolve(OpenMevBundleResolution.AccountNonceTooHigh);
                }
                else {
                    const block = await this.genericProvider.getBlock(targetBlockNumber);
                    // check bundle against block:
                    const blockTransactionsHash = {};
                    for (const bt of block.transactions) {
                        blockTransactionsHash[bt] = true;
                    }
                    const bundleIncluded = transactionAccountNonces.every((transaction) => blockTransactionsHash[transaction.hash]);
                    resolve(bundleIncluded
                        ? OpenMevBundleResolution.BundleIncluded
                        : OpenMevBundleResolution.BlockPassedWithoutInclusion);
                }
                if (timer) {
                    clearTimeout(timer);
                }
                if (done) {
                    return;
                }
                done = true;
                this.genericProvider.removeListener('block', handler);
            };
            this.genericProvider.on('block', handler);
            if (typeof timeout === 'number' && timeout > 0) {
                timer = setTimeout(() => {
                    if (done) {
                        return;
                    }
                    timer = null;
                    done = true;
                    this.genericProvider.removeListener('block', handler);
                    reject('❌ Rejected: Timed out');
                    console.log(reject);
                }, timeout);
                if (timer.unref) {
                    timer.unref();
                }
            }
        });
    }
    async getUserStats() {
        const blockDetails = await this.genericProvider.getBlock('latest');
        // @type radix
        const evmBlockNumber = `0x${blockDetails.number.toString(16)}`;
        const params = [evmBlockNumber];
        const request = JSON.stringify(this.prepareBundleRequest('openmev_getUserStats', params));
        const response = await this.request(request);
        if (response.error !== undefined && response.error !== null) {
            return {
                error: {
                    message: response.error.message,
                    code: response.error.code,
                },
            };
        }
        return response.result;
    }
    async getBundleStats(bundleHash, blockNumber) {
        const evmBlockNumber = `0x${blockNumber.toString(16)}`;
        const params = [{ bundleHash, blockNumber: evmBlockNumber }];
        const request = JSON.stringify(this.prepareBundleRequest('openmev_getBundleStats', params));
        const response = await this.request(request);
        if (response.error !== undefined && response.error !== null) {
            return {
                error: {
                    message: response.error.message,
                    code: response.error.code,
                },
            };
        }
        return response.result;
    }
    async simulate(signedBundledTransactions, blockTag, stateBlockTag, blockTimestamp) {
        let evmBlockNumber;
        if (typeof blockTag === 'number') {
            evmBlockNumber = `0x${blockTag.toString(16)}`;
        }
        else {
            const blockTagDetails = await this.genericProvider.getBlock(blockTag);
            const blockDetails = blockTagDetails !== null
                ? blockTagDetails
                : await this.genericProvider.getBlock('latest');
            evmBlockNumber = `0x${blockDetails.number.toString(16)}`;
        }
        let evmBlockStateNumber;
        if (typeof stateBlockTag === 'number') {
            evmBlockStateNumber = `0x${stateBlockTag.toString(16)}`;
        }
        else if (!stateBlockTag) {
            evmBlockStateNumber = 'latest';
        }
        else {
            evmBlockStateNumber = stateBlockTag;
        }
        const params = [
            {
                txs: signedBundledTransactions,
                blockNumber: evmBlockNumber,
                stateBlockNumber: evmBlockStateNumber,
                timestamp: blockTimestamp,
            },
        ];
        const request = JSON.stringify(this.prepareBundleRequest('eth_callBundle', params));
        const response = await this.request(request);
        if (response.error !== undefined && response.error !== null) {
            return {
                error: {
                    message: response.error.message,
                    code: response.error.code,
                },
            };
        }
        const callResult = response.result;
        return {
            bundleHash: callResult.bundleHash,
            coinbaseDiff: bignumber_1.BigNumber.from(callResult.coinbaseDiff),
            results: callResult.results,
            totalGasUsed: callResult.results.reduce((a, b) => a + b.gasUsed, 0),
            firstRevert: callResult.results.find((txSim) => 'revert' in txSim),
        };
    }
    /**
     *  @method sendCarrierTransaction
     *  @summary Method to send a carrier tx into the public mempool
     *
     * @param bundle  OpenMevBundle with AT LEAST signed bundled transactions in `signedBundledTransactions` field obtainedf rom {@link signBundle} method, and `blockTarget`.
     * @param validatorPublicKey; The public key of the validator that will be able to decrypt the bundle and include it into the bundle pool.
     * @param signer  Signer who will sign the carrier transaction.
     * @param carrierTx TransactionRequest whose data field will carry the encrypted bundle : MAY be an incomplete
     *  object which will be populated with default values.
     *
     * @return {Promise<TransactionResponse>} Promise containing the response for the carrier tx
     * @since v0.6.0
     *
     */
    async sendCarrierTransaction(bundle, validatorPublicKey, signer, carrierTx) {
        // @note RLP-serialize the given bundle */
        const serializedBundle = this.rlpSerializeBundle(bundle);
        // @note Encrypt the encoded bundle with the passed validator pub_key */
        const encryptedBundle = (0, eciesjs_1.encrypt)(validatorPublicKey, Buffer.from(serializedBundle));
        // @note Populate carrier_tx.data as : carrier_tx.data = MEV_Prefix | validator pub_key | Encrypt(validator pub_key, serialized bundle) */
        const mevPrefix = `0123`; // @TODO placeholder value
        let payload = `0x`;
        payload += mevPrefix;
        payload += validatorPublicKey;
        payload += encryptedBundle.toString('hex');
        carrierTx.data = payload;
        /**
         * @dev Check if carrier_tx has minimum params, populate with defaults if not */
        /**
         The following statement is intended to be used in order to support any type of incomplete TransactionRequest
         received, populating it with default values if any one is missing
        */
        await this.populateCarrierTransaction(carrierTx, signer);
        // @dev Sign the transaction received as param with passed signer
        const signedTx = await signer.signTransaction(carrierTx);
        // @dev Propagate carrier_tx into the public mempool and return Promise<TransactionResponse> for the carrier_tx
        return this.genericProvider.sendTransaction(signedTx);
    }
    /**
     * @method rlpSerializeBundle
     * @summary A private method to encode a OpenMevBundle following the RLP serialization standard.
     * @param bundle; the OpenMevBundle instance to be serialized.
     * @returns string; the RLP encoded bundle.
     * @typedef string
     * @private
     * @since v0.6.0
     */
    rlpSerializeBundle(bundle) {
        if (bundle.signedBundledTransactions === undefined ||
            bundle.signedBundledTransactions.length === 0)
            throw Error('Bundle has no transactions');
        if (bundle.options === undefined)
            bundle.options = {};
        const fields = [
            bundle.signedBundledTransactions,
            this.formatNumber(bundle.blockTarget || 0),
            this.formatNumber(bundle.options.minTimestamp || 0),
            this.formatNumber(bundle.options.maxTimestamp || 0),
            bundle.options.revertingTxHashes || [],
        ];
        return (0, rlp_1.encode)(fields);
    }
    formatNumber(num) {
        const hexNum = num.toString(16);
        return hexNum.length % 2 === 0 ? `0x${hexNum}` : `0x0${hexNum}`;
    }
    /**
     * A private method to populate {@param carrier}'s missing fields with default values
     * @param carrier an instance of TransactionRequest which will be the tx containing the full payload in its data field
     * @param signer the signer Object which will send the carrier tx
     * @private
     * @since v0.6.0
     */
    async populateCarrierTransaction(carrier, signer) {
        if (!('to' in carrier))
            throw Error('carrier.to field is missing');
        if (carrier.gasPrice != null) {
            const gasPrice = bignumber_1.BigNumber.from(carrier.gasPrice);
            const maxFeePerGas = bignumber_1.BigNumber.from(carrier.maxFeePerGas || 0);
            if (!gasPrice.eq(maxFeePerGas)) {
                throw Error('carrier tx EIP-1559 mismatch: gasPrice != maxFeePerGas');
            }
        }
        const latestBlock = await this.genericProvider.getBlock('latest');
        const blocksInFuture = 5;
        const maxBaseFeeInFuture = OpenMevBundleProvider.getMaxBaseFeeInFutureBlock(latestBlock.baseFeePerGas, blocksInFuture);
        carrier.type = 2;
        carrier.chainId = carrier.chainId || 1;
        carrier.nonce =
            carrier.nonce ||
                (await this.genericProvider.getTransactionCount(signer.getAddress()));
        carrier.maxPriorityFeePerGas =
            carrier.maxPriorityFeePerGas || (0, units_1.parseUnits)('1.5', 'gwei');
        carrier.maxFeePerGas =
            carrier.maxFeePerGas ||
                maxBaseFeeInFuture.add(carrier.maxPriorityFeePerGas);
        carrier.gasLimit =
            carrier.gasLimit || (await this.genericProvider.estimateGas(carrier));
        carrier.value = carrier.value || 0;
        carrier.accessList = carrier.accessList || [];
    }
    /**
     *
     * @param connectionInfo
     * @returns {X-OpenMev-Signature}
     * @summary OpenMEV currently does not utilize proprietary header information, so we just leave the flashbots implementation as is
     */
    async request(request) {
        const connectionInfo = { ...this.connectionInfo };
        connectionInfo.headers = {
            'X-OpenMev-Signature': `${await this.authSigner.getAddress()}:${await this.authSigner.signMessage(id(request))}`,
            ...this.connectionInfo.headers,
        };
        return (0, web_1.fetchJson)(connectionInfo, request);
    }
    async fetchReceipts(bundledTransactions) {
        return Promise.all(bundledTransactions.map((bundledTransaction) => this.genericProvider.getTransactionReceipt(bundledTransaction.hash)));
    }
    /**
     *
     * @param prepareBundleRequest
     * @param {eth_callBundle, eth_sendBundle, eth_sendMegaBundle }
     * @returns {method, params, id, jsonrpc}
     * @since v0.5.0
     *  - eth_sendMegaBundle, v0.6.0
     */
    prepareBundleRequest(method, params) {
        return {
            method: method,
            params: params,
            id: this._nextId++,
            jsonrpc: '2.0',
        };
    }
}
exports.OpenMevBundleProvider = OpenMevBundleProvider;
//# sourceMappingURL=openmev.js.map