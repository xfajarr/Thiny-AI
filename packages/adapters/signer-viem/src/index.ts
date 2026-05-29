import {
  createWalletClient,
  createPublicClient,
  http,
  type Chain,
  type WalletClient,
  type PublicClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia, mainnet } from "viem/chains";
import type { Signer, TxRequest, Hex } from "@thiny/core";

export interface ViemSignerOptions {
  /** Private key as a 0x-prefixed hex string. Use a TESTNET-ONLY throwaway key. */
  privateKey: Hex;
  /** EIP-155 chain ID. */
  chainId: number;
  /** JSON-RPC endpoint URL. */
  rpcUrl: string;
  /** Whether this signer operates on a testnet. */
  isTestnet: boolean;
  /**
   * Must be explicitly `true` to allow signing on mainnet (chainId 1).
   * Protects against accidentally pointing a testnet key at mainnet.
   */
  allowMainnet?: boolean;
}

const KNOWN_CHAINS: Record<number, Chain> = {
  1: mainnet,
  11155111: sepolia,
};

/**
 * Create a viem-backed `Signer` that signs and broadcasts transactions.
 *
 * **Security:** refuses mainnet (chainId 1) unless `allowMainnet: true` is
 * explicitly passed. For production, prefer a policy-controlled custody wallet
 * over a raw private key.
 *
 * @throws {Error} When mainnet is requested without `allowMainnet: true`.
 * @throws {Error} When the chainId is unknown (not in the built-in chain map).
 *
 * @example testnet (safe default)
 * ```ts
 * const signer = viemSigner({
 *   privateKey: process.env.AGENT_PRIVATE_KEY as Hex,
 *   chainId: 11155111,
 *   rpcUrl: process.env.EVM_RPC_URL!,
 *   isTestnet: true,
 * });
 * ```
 */
export function viemSigner(opts: ViemSignerOptions): Signer {
  if (opts.chainId === 1 && !opts.isTestnet && opts.allowMainnet !== true) {
    throw new Error(
      `viemSigner: refusing to create a mainnet signer. ` +
        `Pass allowMainnet: true to enable real-value signing. ` +
        `For production, prefer a policy-controlled custody wallet.`,
    );
  }

  const chain = KNOWN_CHAINS[opts.chainId];
  if (!chain) {
    throw new Error(
      `viemSigner: unsupported chainId ${String(opts.chainId)}. ` +
        `Supported: ${Object.keys(KNOWN_CHAINS).join(", ")}. ` +
        `Pass a custom chain object to extend support.`,
    );
  }

  const account = privateKeyToAccount(opts.privateKey);
  const transport = http(opts.rpcUrl);

  const walletClient: WalletClient = createWalletClient({ account, chain, transport });
  const publicClient: PublicClient = createPublicClient({ chain, transport });

  return {
    address: account.address,
    chainId: opts.chainId,
    isTestnet: opts.isTestnet,

    async signAndSend(tx: TxRequest): Promise<Hex> {
      const hash = await walletClient.sendTransaction({
        to: tx.to,
        value: tx.value,
        data: tx.data,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      return hash;
    },
  };
}
