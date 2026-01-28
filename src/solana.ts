import { Connection } from "@solana/web3.js";
import { CONFIG } from "./config.js";

export const connection = new Connection(CONFIG.solanaRpcUrl, {
  commitment: CONFIG.commitment
});
