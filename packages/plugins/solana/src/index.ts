import { z } from "zod";
import type { Keypair } from "@solana/web3.js";
import {
  Connection,
  PublicKey,
  LAMPORTS_PER_SOL,
  clusterApiUrl,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  type Cluster,
} from "@solana/web3.js";
import { defineTool, type Plugin } from "@thiny/core";

export { solanaTransferRules, type SolanaTransferLimits } from "./rules.js";

export interface SolanaPluginOptions {
  /**
   * Solana cluster to connect to.
   * Defaults to `"devnet"` — never mainnet without explicit opt-in.
   */
  cluster?: Cluster;
  /** Inject a Connection for testing (overrides `cluster`). */
  connection?: Connection;
  /**
   * Keypair for `solana_send_sol`.
   * When absent the tool throws a clear error which the model sees as an observation.
   * Use a devnet-funded throwaway keypair — never a real wallet.
   */
  keypair?: Keypair;
}

/**
 * Solana plugin — read devnet chain state and optionally send SOL.
 *
 * Tools:
 * - `solana_get_balance` — native SOL balance (lamports + SOL)
 * - `solana_send_sol` — sensitive; requires policy + approval
 *
 * Pair with `solanaTransferRules` in `policyMiddleware` for deterministic
 * lamport caps and destination allowlisting.
 *
 * @example
 * ```ts
 * import { solanaPlugin, solanaTransferRules } from "@thiny/plugin-solana";
 *
 * const agent = await createAgent({
 *   model: loadThinyConfig(),
 *   plugins: [
 *     solanaPlugin({ cluster: "devnet", keypair: myDevnetKeypair }),
 *     {
 *       name: "policy",
 *       toolMiddleware: [
 *         policyMiddleware(solanaTransferRules({
 *           maxLamports: 10_000_000n, // 0.01 SOL
 *           allowlist: [recipientPubkey.toBase58()],
 *         })),
 *       ],
 *     },
 *   ],
 * });
 * ```
 */
export function solanaPlugin(opts: SolanaPluginOptions = {}): Plugin {
  const connection =
    opts.connection ?? new Connection(clusterApiUrl(opts.cluster ?? "devnet"), "confirmed");

  return {
    name: "solana",
    tools: [
      defineTool({
        name: "solana_get_balance",
        description:
          "Get the native SOL balance of a Solana wallet address. " +
          "Returns balance in lamports and formatted SOL (1 SOL = 1_000_000_000 lamports).",
        parameters: z.object({
          owner: z.string().min(32).max(44).describe("base58-encoded Solana public key"),
        }),
        execute: async ({ owner }) => {
          const lamports = await connection.getBalance(new PublicKey(owner));
          return {
            lamports: String(lamports),
            sol: lamports / LAMPORTS_PER_SOL,
          };
        },
      }),

      defineTool({
        name: "solana_send_sol",
        description:
          "Send native SOL to a Solana address on devnet. " +
          "SENSITIVE: requires policy approval. Always confirm the destination and amount. " +
          "Only operates on devnet — never mainnet.",
        sensitive: true,
        locks: ["solana:write"],
        parameters: z.object({
          to: z.string().min(32).max(44).describe("base58 recipient public key"),
          lamports: z.string().regex(/^\d+$/, "must be a decimal lamport amount"),
        }),
        execute: async ({ to, lamports }, ctx) => {
          if (!opts.keypair) {
            throw new Error(
              "solana_send_sol: no keypair configured. " +
                "Pass a keypair to solanaPlugin() to enable sending.",
            );
          }

          ctx.logger.info(
            { event: "solana_send", to, lamports },
            `Sending ${lamports} lamports to ${to}`,
          );

          const transaction = new Transaction().add(
            SystemProgram.transfer({
              fromPubkey: opts.keypair.publicKey,
              toPubkey: new PublicKey(to),
              lamports: Number(BigInt(lamports)),
            }),
          );

          const signature = await sendAndConfirmTransaction(connection, transaction, [
            opts.keypair,
          ]);

          return { signature, to, lamports };
        },
      }),
    ],
  };
}

export default function (_env: Record<string, string | undefined> = process.env): Plugin {
  return solanaPlugin({ cluster: "devnet" });
}
