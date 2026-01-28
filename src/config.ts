import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  SOLANA_RPC_URL: z.string().min(1),
  OWNER_KEYPAIR_PATH: z.string().min(1),

  USE_KORA: z.string().optional().default("0"),
  KORA_RPC_URL: z.string().optional().default("http://localhost:8080"),

  DRY_RUN: z.string().optional().default("1"),
  MIN_RENT_LAMPORTS: z.string().optional().default("0"),
  MAX_CLOSE_PER_RUN: z.string().optional().default("25"),

  COMMITMENT: z.string().optional().default("confirmed"),
  LOG_LEVEL: z.string().optional().default("info")
});

const env = schema.parse(process.env);

export const CONFIG = {
  solanaRpcUrl: env.SOLANA_RPC_URL,
  ownerKeypairPath: env.OWNER_KEYPAIR_PATH,

  useKora: env.USE_KORA === "1",
  koraRpcUrl: env.KORA_RPC_URL,

  dryRun: env.DRY_RUN === "1",
  minRentLamports: Number(env.MIN_RENT_LAMPORTS),
  maxClosePerRun: Number(env.MAX_CLOSE_PER_RUN),

  commitment: env.COMMITMENT as "processed" | "confirmed" | "finalized",
  logLevel: env.LOG_LEVEL
};
