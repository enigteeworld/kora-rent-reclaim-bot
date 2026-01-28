import { CONFIG } from "./config.js";
import { log } from "./logger.js";
import { connection } from "./solana.js";
import { loadKeypairFromFile } from "./keys.js";
import { runReclaimer } from "./reclaim.js";
import { CLI } from "./cli.js";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runOnce() {
  const operator = loadKeypairFromFile(CONFIG.ownerKeypairPath);

  log.info(
    { solanaRpc: CONFIG.solanaRpcUrl, useKora: CONFIG.useKora, dryRun: CONFIG.dryRun },
    "Boot"
  );

  const report = await runReclaimer(connection, operator);

  if (CLI.json) {
    // Print JSON report to stdout for judges/automation
    console.log(JSON.stringify({ ts: new Date().toISOString(), ...report }, null, 2));
  }

  return report;
}

async function main() {
  if (CLI.watch) {
    log.info({ intervalSec: CLI.intervalSec }, "Watch mode enabled");
    // loop forever
    while (true) {
      await runOnce();
      await sleep(CLI.intervalSec * 1000);
    }
  } else {
    await runOnce();
  }
}

main().catch((e) => {
  log.error({ err: String(e) }, "Fatal");
  process.exit(1);
});
