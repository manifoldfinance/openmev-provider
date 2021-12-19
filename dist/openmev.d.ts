/**
 * @package @openmev/ethers-provider
 * @version 1.2.0
 * @since 2021.12
 * @license Apache-2.0
 * @see {@link https://docs.openmev.org}
 */
import { BlockTag, TransactionReceipt, TransactionRequest } from '@ethersproject/abstract-provider';
import { Signer } from '@ethersproject/abstract-signer';
import { Networkish } from '@ethersproject/networks';
import { ConnectionInfo } from '@ethersproject/web';
import * as providers from '@ethersproject/providers';
import { BaseProvider, TransactionResponse } from '@ethersproject/providers';
import { BigNumber } from '@ethersproject/bignumber';
export declare function id(text: string): string;
export declare const DEFAULT_FLASHBOTS_RELAY_ENDPOINT = "https://relay.flashbots.net";
export declare const DEFAULT_FLASHBOTS_RPC_ENDPOINT = "https://rpc.flashbots.net";
export declare const DEFAULT_FLASHBOTS_ENDPOINT = "https://relay.flashbots.net";
export declare const DEFAULT_ETHERMINE_ENDPOINT = "https://mev-relay.ethermine.org/";
export declare const DEFAULT_EDENNETWORK_ENDPOINT = "https://api.edennetwork.io/v1/rpc";
export declare const DEFAULT_OPENMEV_ENDPOINT = "https://mainnet.eth.openmev.org/v1";
export declare const DEFAULT_SUSHIRELAY_ENDPOINT = "https://api.sushirelay.com/v1";
export declare const DEFAULT_OPENMEV_ENDPOINT_PROVIDER = "https://api.sushirelay.com/v1";
export declare enum SystemConfigId {
    CONFIG_MINER_RELAY = 0,
    UNRECOGNIZED = -1
}
export declare function systemConfigIdFromJSON(object: any): SystemConfigId;
export declare function systemConfigIdToJSON(object: SystemConfigId): string;
export declare enum BundleSourceId {
    BATCH_BUNDLER = 0,
    KDB = 1,
    UNREC = 2
}
export declare enum OpenMevBundleResolution {
    BundleIncluded = 0,
    BlockPassedWithoutInclusion = 1,
    AccountNonceTooHigh = 2
}
export interface OpenMevBundleRawTransaction {
    signedTransaction: string;
}
export interface OpenMevBundleTransaction {
    transaction: TransactionRequest;
    signer: Signer;
}
export interface OpenMevOptions {
    minTimestamp?: number;
    maxTimestamp?: number;
    revertingTxHashes?: Array<string>;
}
export interface OpenMevBundle {
    signedBundledTransactions: Array<string>;
    blockTarget: number;
    options?: OpenMevOptions;
}
export interface TransactionAccountNonce {
    hash: string;
    signedTransaction: string;
    account: string;
    nonce: number;
}
export interface OpenMevTransactionResponse {
    bundleTransactions: Array<TransactionAccountNonce>;
    wait: () => Promise<OpenMevBundleResolution>;
    simulate: () => Promise<SimulationResponse>;
    receipts: () => Promise<Array<TransactionReceipt>>;
}
export interface TransactionSimulationBase {
    txHash: string;
    gasUsed: number;
}
export interface TransactionSimulationSuccess extends TransactionSimulationBase {
    value: string;
}
export interface TransactionSimulationRevert extends TransactionSimulationBase {
    error: string;
    revert: string;
}
export declare type TransactionSimulation = TransactionSimulationSuccess | TransactionSimulationRevert;
export interface RelayResponseError {
    error: {
        message: string;
        code: number;
    };
}
export interface SimulationResponseSuccess {
    bundleHash: string;
    coinbaseDiff: BigNumber;
    results: Array<TransactionSimulation>;
    totalGasUsed: number;
    firstRevert?: TransactionSimulation;
}
export declare type SimulationResponse = SimulationResponseSuccess | RelayResponseError;
export declare type OpenMevTransaction = OpenMevTransactionResponse | RelayResponseError;
export interface GetUserStatsResponseSuccess {
    signing_address: string;
    blocks_won_total: number;
    bundles_submitted_total: number;
    bundles_error_total: number;
    avg_gas_price_gwei: number;
    blocks_won_last_7d: number;
    bundles_submitted_last_7d: number;
    bundles_error_7d: number;
    avg_gas_price_gwei_last_7d: number;
    blocks_won_last_numbered: number;
    bundles_submitted_last_numberd: number;
    bundles_error_numberd: number;
    avg_gas_price_gwei_last_numberd: number;
    blocks_won_last_numberh: number;
    bundles_submitted_last_numberh: number;
    bundles_error_numberh: number;
    avg_gas_price_gwei_last_numberh: number;
    blocks_won_last_5m: number;
    bundles_submitted_last_5m: number;
    bundles_error_5m: number;
    avg_gas_price_gwei_last_5m: number;
}
export declare type GetUserStatsResponse = GetUserStatsResponseSuccess | RelayResponseError;
export interface GetBundleStatsResponseSuccess {
    isSimulated: boolean;
    isSentToMiners: boolean;
    isHighPriority: boolean;
    simulatedAt: string;
    submittedAt: string;
    sentToMinersAt: Date;
}
export declare type GetBundleStatsResponse = GetBundleStatsResponseSuccess | RelayResponseError;
export declare class OpenMevBundleProvider extends providers.JsonRpcProvider {
    private genericProvider;
    private authSigner;
    private connectionInfo;
    constructor(genericProvider: BaseProvider, authSigner: Signer, connectionInfoOrUrl: ConnectionInfo, network: Networkish);
    static throttleCallback(): Promise<boolean>;
    static create(genericProvider: BaseProvider, authSigner: Signer, connectionInfoOrUrl?: ConnectionInfo | string, network?: Networkish): Promise<OpenMevBundleProvider>;
    static getMaxBaseFeeInFutureBlock(baseFee: BigNumber, blocksInFuture: number): BigNumber;
    sendRawBundle(signedBundledTransactions: Array<string>, targetBlockNumber: number, opts?: OpenMevOptions): Promise<OpenMevTransaction>;
    sendBundle(bundledTransactions: Array<OpenMevBundleTransaction | OpenMevBundleRawTransaction>, targetBlockNumber: number, opts?: OpenMevOptions): Promise<OpenMevTransaction>;
    signBundle(bundledTransactions: Array<OpenMevBundleTransaction | OpenMevBundleRawTransaction>): Promise<Array<string>>;
    private wait;
    getUserStats(): Promise<GetUserStatsResponse>;
    getBundleStats(bundleHash: string, blockNumber: number): Promise<GetBundleStatsResponse>;
    simulate(signedBundledTransactions: Array<string>, blockTag: BlockTag, stateBlockTag?: BlockTag, blockTimestamp?: number): Promise<SimulationResponse>;
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
    sendCarrierTransaction(bundle: OpenMevBundle, validatorPublicKey: string, signer: Signer, carrierTx: TransactionRequest): Promise<TransactionResponse>;
    /**
     * @method rlpSerializeBundle
     * @summary A private method to encode a OpenMevBundle following the RLP serialization standard.
     * @param bundle; the OpenMevBundle instance to be serialized.
     * @returns string; the RLP encoded bundle.
     * @typedef string
     * @private
     * @since v0.6.0
     */
    private rlpSerializeBundle;
    private formatNumber;
    /**
     * A private method to populate {@param carrier}'s missing fields with default values
     * @param carrier an instance of TransactionRequest which will be the tx containing the full payload in its data field
     * @param signer the signer Object which will send the carrier tx
     * @private
     * @since v0.6.0
     */
    private populateCarrierTransaction;
    /**
     *
     * @param connectionInfo
     * @returns {X-OpenMev-Signature}
     * @summary OpenMEV currently does not utilize proprietary header information, so we just leave the flashbots implementation as is
     */
    private request;
    private fetchReceipts;
    /**
     *
     * @param prepareBundleRequest
     * @param {eth_callBundle, eth_sendBundle, eth_sendMegaBundle }
     * @returns {method, params, id, jsonrpc}
     * @since v0.5.0
     *  - eth_sendMegaBundle, v0.6.0
     */
    private prepareBundleRequest;
}
