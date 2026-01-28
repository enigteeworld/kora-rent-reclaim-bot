import fs from "node:fs";
import { Keypair } from "@solana/web3.js";

export function loadKeypairFromFile(path: string): Keypair {
  const raw = fs.readFileSync(path, "utf8");
  const secret = Uint8Array.from(JSON.parse(raw));
  return Keypair.fromSecretKey(secret);
}
