import {
  BlockTag,
  TransactionReceipt,
  TransactionRequest,
} from '@ethersproject/abstract-provider';
import { Signer } from '@ethersproject/abstract-signer';

import { Networkish } from '@ethersproject/networks';

import { ConnectionInfo, fetchJson } from '@ethersproject/web';
// import { BigNumber, ethers, providers, Signer } from 'ethers'
import { keccak256 } from '@ethersproject/keccak256';
import * as providers from '@ethersproject/providers';
import { Provider, BaseProvider } from '@ethersproject/providers';
import { BigNumber } from '@ethersproject/bignumber';
import {
  accessListify,
  computeAddress,
  parse as parseTransaction,
} from '@ethersproject/transactions';
import { toUtf8Bytes } from '@ethersproject/strings';

export function id(text: string): string {
  return keccak256(toUtf8Bytes(text));
}

export const DEFAULT_FLASHBOTS_ENDPOINT = 'https://relay.flashbots.net';
export const DEFAULT_ETHERMINE_ENDPOINT = 'https://mev-relay.ethermine.org/';
export const DEFAULT_TAICHI_ENDPOINT =
  'https://api-us.taichi.network:10001/rpc/private';
export const DEFAULT_OPENMEV_ENDPOINT_PROVIDER =
  'https://api.openmev.net:10001/v1/public/provider';

export enum SystemConfigId {
  CONFIG_MINER_RELAY = 0,
  UNRECOGNIZED = -1,
}

export function systemConfigIdFromJSON(object: any): SystemConfigId {
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

export function systemConfigIdToJSON(object: SystemConfigId): string {
  switch (object) {
    case SystemConfigId.CONFIG_MINER_RELAY:
      return 'CONFIG_MINER_RELAY';
    default:
      return 'UNKNOWN';
  }
}

// @TODO add additional SourceIds
//    openmev, keeper, secret
export enum BundleSourceId {
  BATCH_BUNDLER = 0,
  KDB = 1,
  UNREC,
}

export enum FlashbotsBundleResolution {
  BundleIncluded,
  BlockPassedWithoutInclusion,
  AccountNonceTooHigh,
}

export interface FlashbotsBundleRawTransaction {
  signedTransaction: string;
}

export interface FlashbotsBundleTransaction {
  transaction: TransactionRequest;
  signer: Signer;
}

export interface FlashbotsOptions {
  minTimestamp?: number;
  maxTimestamp?: number;
  revertingTxHashes?: Array<string>;
}

export interface TransactionAccountNonce {
  hash: string;
  signedTransaction: string;
  account: string;
  nonce: number;
}

export interface FlashbotsTransactionResponse {
  bundleTransactions: Array<TransactionAccountNonce>;
  wait: () => Promise<FlashbotsBundleResolution>;
  simulate: () => Promise<SimulationResponse>;
  receipts: () => Promise<Array<TransactionReceipt>>;
}

export interface TransactionSimulationBase {
  txHash: string;
  gasUsed: number;
}

export interface TransactionSimulationSuccess
  extends TransactionSimulationBase {
  value: string;
}

export interface TransactionSimulationRevert extends TransactionSimulationBase {
  error: string;
  revert: string;
}

export type TransactionSimulation =
  | TransactionSimulationSuccess
  | TransactionSimulationRevert;

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

export type SimulationResponse = SimulationResponseSuccess | RelayResponseError;

export type FlashbotsTransaction =
  | FlashbotsTransactionResponse
  | RelayResponseError;

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

export type GetUserStatsResponse =
  | GetUserStatsResponseSuccess
  | RelayResponseError;

export interface GetBundleStatsResponseSuccess {
  isSimulated: boolean;
  isSentToMiners: boolean;
  isHighPriority: boolean;
  simulatedAt: string;
  submittedAt: string;
  sentToMinersAt: Date;
}

export type GetBundleStatsResponse =
  | GetBundleStatsResponseSuccess
  | RelayResponseError;

type RpcParams = Array<string[] | string | number | Record<string, unknown>>;

const TIMEOUT_MS = 5 * 60 * 1000;

export class FlashbotsBundleProvider extends providers.JsonRpcProvider {
  private genericProvider: BaseProvider;
  private authSigner: Signer;
  private connectionInfo: ConnectionInfo;

  constructor(
    genericProvider: BaseProvider,
    authSigner: Signer,
    connectionInfoOrUrl: ConnectionInfo,
    network: Networkish,
  ) {
    super(connectionInfoOrUrl, network);
    this.genericProvider = genericProvider;
    this.authSigner = authSigner;
    this.connectionInfo = connectionInfoOrUrl;
  }

  static async throttleCallback(): Promise<boolean> {
    console.warn('🆘 Warning: Rate limited');
    return false;
  }

  static async create(
    genericProvider: BaseProvider,
    authSigner: Signer,
    connectionInfoOrUrl?: ConnectionInfo | string,
    network?: Networkish,
  ): Promise<FlashbotsBundleProvider> {
    const connectionInfo: ConnectionInfo =
      typeof connectionInfoOrUrl === 'string' ||
      typeof connectionInfoOrUrl === 'undefined'
        ? {
            url: connectionInfoOrUrl || DEFAULT_OPENMEV_ENDPOINT_PROVIDER,
          }
        : {
            ...connectionInfoOrUrl,
          };
    if (connectionInfo.headers === undefined) connectionInfo.headers = {};
    connectionInfo.throttleCallback = FlashbotsBundleProvider.throttleCallback;
    const networkish: Networkish = {
      chainId: 0,
      name: '',
    };
    if (typeof network === 'string') {
      networkish.name = network;
    } else if (typeof network === 'number') {
      networkish.chainId = network;
    } else if (typeof network === 'object') {
      networkish.name = network.name;
      networkish.chainId = network.chainId;
    }

    if (networkish.chainId === 0) {
      networkish.chainId = (await genericProvider.getNetwork()).chainId;
    }

    return new FlashbotsBundleProvider(
      genericProvider,
      authSigner,
      connectionInfo,
      networkish,
    );
  }

  static getMaxBaseFeeInFutureBlock(
    baseFee: BigNumber,
    blocksInFuture: number,
  ): BigNumber {
    let maxBaseFee = BigNumber.from(baseFee);
    for (let i = 0; i < blocksInFuture; i++) {
      maxBaseFee = maxBaseFee.mul(1125).div(1000).add(1);
    }
    return maxBaseFee;
  }

  public async sendRawBundle(
    signedBundledTransactions: Array<string>,
    targetBlockNumber: number,
    opts?: FlashbotsOptions,
  ): Promise<FlashbotsTransaction> {
    const params = {
      txs: signedBundledTransactions,
      blockNumber: `0x${targetBlockNumber.toString(16)}`,
      minTimestamp: opts?.minTimestamp,
      maxTimestamp: opts?.maxTimestamp,
      revertingTxHashes: opts?.revertingTxHashes,
    };

    const request = JSON.stringify(
      this.prepareBundleRequest('eth_sendBundle', [params]),
    );
    const response = await this.request(request);
    if (response.error !== undefined && response.error !== null) {
      return {
        error: {
          message: response.error.message,
          code: response.error.code,
        },
      };
    }

    const bundleTransactions = signedBundledTransactions.map(
      (signedTransaction) => {
        const transactionDetails = parseTransaction(signedTransaction);
        return {
          signedTransaction,
          hash: keccak256(signedTransaction),
          account: transactionDetails.from || '0x0',
          nonce: transactionDetails.nonce,
        };
      },
    );

    return {
      bundleTransactions,
      wait: () => this.wait(bundleTransactions, targetBlockNumber, TIMEOUT_MS),
      simulate: () =>
        this.simulate(
          bundleTransactions.map((tx) => tx.signedTransaction),
          targetBlockNumber,
          undefined,
          opts?.minTimestamp,
        ),
      receipts: () => this.fetchReceipts(bundleTransactions),
    };
  }

  public async sendBundle(
    bundledTransactions: Array<
      FlashbotsBundleTransaction | FlashbotsBundleRawTransaction
    >,
    targetBlockNumber: number,
    opts?: FlashbotsOptions,
  ): Promise<FlashbotsTransaction> {
    const signedTransactions = await this.signBundle(bundledTransactions);
    return this.sendRawBundle(signedTransactions, targetBlockNumber, opts);
  }

  public async signBundle(
    bundledTransactions: Array<
      FlashbotsBundleTransaction | FlashbotsBundleRawTransaction
    >,
  ): Promise<Array<string>> {
    const nonces: { [address: string]: BigNumber } = {};
    const signedTransactions = new Array<string>();
    for (const tx of bundledTransactions) {
      if ('signedTransaction' in tx) {
        /** @note In case someone is mixing pre-signed and signing transactions, decode to add to nonce object */
        const transactionDetails = parseTransaction(tx.signedTransaction);
        if (transactionDetails.from === undefined)
          throw new Error('❌ Error: unable to decode signed transaction');
        console.log(Error);

        nonces[transactionDetails.from] = BigNumber.from(
          transactionDetails.nonce + 1,
        );
        signedTransactions.push(tx.signedTransaction);
        continue;
      }
      const transaction = { ...tx.transaction };
      const address = await tx.signer.getAddress();
      if (typeof transaction.nonce === 'string')
        throw new Error('❌ Error: Bad nonce');
      console.log(Error);

      const nonce =
        transaction.nonce !== undefined
          ? BigNumber.from(transaction.nonce)
          : nonces[address] ||
            BigNumber.from(
              await this.genericProvider.getTransactionCount(address, 'latest'),
            );
      nonces[address] = nonce.add(1);
      if (transaction.nonce === undefined) transaction.nonce = nonce;
      if (
        (transaction.type == null || transaction.type == 0) &&
        transaction.gasPrice === undefined
      )
        transaction.gasPrice = BigNumber.from(0);
      if (transaction.gasLimit === undefined)
        transaction.gasLimit = await tx.signer.estimateGas(transaction); // TODO: Add target block number and timestamp when supported by geth
      signedTransactions.push(await tx.signer.signTransaction(transaction));
    }
    return signedTransactions;
  }

  private wait(
    transactionAccountNonces: Array<TransactionAccountNonce>,
    targetBlockNumber: number,
    timeout: number,
  ) {
    return new Promise<FlashbotsBundleResolution>((resolve, reject) => {
      let timer: NodeJS.Timer | null = null;
      let done = false;

      const minimumNonceByAccount = transactionAccountNonces.reduce(
        (acc, accountNonce) => {
          if (
            accountNonce.nonce > 0 &&
            (accountNonce.nonce || 0) < acc[accountNonce.account]
          ) {
            acc[accountNonce.account] = accountNonce.nonce;
          }
          acc[accountNonce.account] = accountNonce.nonce;
          return acc;
        },
        {} as { [account: string]: number },
      );
      const handler = async (blockNumber: number) => {
        if (blockNumber < targetBlockNumber) {
          const noncesValid = await Promise.all(
            Object.entries(minimumNonceByAccount).map(
              async ([account, nonce]) => {
                const transactionCount =
                  await this.genericProvider.getTransactionCount(account);
                return nonce >= transactionCount;
              },
            ),
          );
          const allNoncesValid = noncesValid.every(Boolean);
          if (allNoncesValid) return;
          // target block not yet reached, but nonce has become invalid

          resolve(FlashbotsBundleResolution.AccountNonceTooHigh);
        } else {
          const block = await this.genericProvider.getBlock(targetBlockNumber);
          // check bundle against block:
          const blockTransactionsHash: { [key: string]: boolean } = {};
          for (const bt of block.transactions) {
            blockTransactionsHash[bt] = true;
          }
          const bundleIncluded = transactionAccountNonces.every(
            (transaction) => blockTransactionsHash[transaction.hash],
          );
          resolve(
            bundleIncluded
              ? FlashbotsBundleResolution.BundleIncluded
              : FlashbotsBundleResolution.BlockPassedWithoutInclusion,
          );
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

  public async getUserStats(): Promise<GetUserStatsResponse> {
    const blockDetails = await this.genericProvider.getBlock('latest');

    // @type radix
    const evmBlockNumber = `0x${blockDetails.number.toString(16)}`;

    const params = [evmBlockNumber];
    const request = JSON.stringify(
      this.prepareBundleRequest('flashbots_getUserStats', params),
    );
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

  public async getBundleStats(
    bundleHash: string,
    blockNumber: number,
  ): Promise<GetBundleStatsResponse> {
    const evmBlockNumber = `0x${blockNumber.toString(16)}`;

    const params = [{ bundleHash, blockNumber: evmBlockNumber }];
    const request = JSON.stringify(
      this.prepareBundleRequest('flashbots_getBundleStats', params),
    );
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

  public async simulate(
    signedBundledTransactions: Array<string>,
    blockTag: BlockTag,
    stateBlockTag?: BlockTag,
    blockTimestamp?: number,
  ): Promise<SimulationResponse> {
    let evmBlockNumber: string;
    if (typeof blockTag === 'number') {
      evmBlockNumber = `0x${blockTag.toString(16)}`;
    } else {
      const blockTagDetails = await this.genericProvider.getBlock(blockTag);
      const blockDetails =
        blockTagDetails !== null
          ? blockTagDetails
          : await this.genericProvider.getBlock('latest');
      evmBlockNumber = `0x${blockDetails.number.toString(16)}`;
    }

    let evmBlockStateNumber: string;
    if (typeof stateBlockTag === 'number') {
      evmBlockStateNumber = `0x${stateBlockTag.toString(16)}`;
    } else if (!stateBlockTag) {
      evmBlockStateNumber = 'latest';
    } else {
      evmBlockStateNumber = stateBlockTag;
    }

    const params: RpcParams = [
      {
        txs: signedBundledTransactions,
        blockNumber: evmBlockNumber,
        stateBlockNumber: evmBlockStateNumber,
        timestamp: blockTimestamp,
      },
    ];
    const request = JSON.stringify(
      this.prepareBundleRequest('eth_callBundle', params),
    );
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
      coinbaseDiff: BigNumber.from(callResult.coinbaseDiff),
      results: callResult.results,
      totalGasUsed: callResult.results.reduce(
        (a: number, b: TransactionSimulation) => a + b.gasUsed,
        0,
      ),
      firstRevert: callResult.results.find(
        (txSim: TransactionSimulation) => 'revert' in txSim,
      ),
    };
  }

  private async request(request: string) {
    const connectionInfo = { ...this.connectionInfo };
    connectionInfo.headers = {
      'X-Flashbots-Signature': `${await this.authSigner.getAddress()}:${await this.authSigner.signMessage(
        id(request),
      )}`,
      ...this.connectionInfo.headers,
    };
    return fetchJson(connectionInfo, request);
  }

  private async fetchReceipts(
    bundledTransactions: Array<TransactionAccountNonce>,
  ): Promise<Array<TransactionReceipt>> {
    return Promise.all(
      bundledTransactions.map((bundledTransaction) =>
        this.genericProvider.getTransactionReceipt(bundledTransaction.hash),
      ),
    );
  }

  private prepareBundleRequest(
    method:
      | 'eth_callBundle'
      | 'eth_sendBundle'
      | 'flashbots_getUserStats'
      | 'flashbots_getBundleStats',
    params: RpcParams,
  ) {
    return {
      method: method,
      params: params,
      id: this._nextId++,
      jsonrpc: '2.0',
    };
  }
}
