import type { Hex } from "./domain/web3.js";

/** The minimum fields required to broadcast a transaction. */
export interface TxRequest {
  /** Recipient address as a 0x-prefixed hex string. */
  to: Hex;
  /** Native token value in wei. Omit for contract calls with no ETH transfer. */
  value?: bigint;
  /** Encoded call data. Omit for plain transfers. */
  data?: Hex;
  /** EIP-155 chain ID. Must match the signer's configured chain. */
  chainId: number;
}

/**
 * PORT: transaction signer.
 *
 * Signs and broadcasts a transaction, waiting for it to be confirmed on-chain.
 *
 * Adapters:
 * - `@thiny/signer-viem` — uses a private key via viem (testnet only by default)
 * - Circle agent wallet  — policy-controlled custody (recommended for mainnet)
 *
 * **Security invariant:** `isTestnet` must be `true` for testnet chains.
 * Adapters should refuse mainnet signing unless explicitly opted in, protecting
 * against accidental real-value transactions.
 */
export interface Signer {
  /** The signer's on-chain address (0x-prefixed). */
  readonly address: Hex;
  /** The EIP-155 chain ID this signer is configured for. */
  readonly chainId: number;
  /**
   * Whether this signer operates on a test network.
   * Tool implementations should check this before executing real-value operations.
   */
  readonly isTestnet: boolean;
  /**
   * Sign and broadcast a transaction, then wait for one confirmation.
   *
   * @returns The transaction hash (0x-prefixed hex).
   * @throws When the transaction fails, is rejected, or times out.
   */
  signAndSend(tx: TxRequest): Promise<Hex>;
}
