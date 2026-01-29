import { Bot } from "grammy";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAccount } from "@solana/spl-token";
import { CONFIG } from "./config.js";
import { log } from "./logger.js";
import { connection } from "./solana.js";
import { loadKeypairFromFile } from "./keys.js";

type ScanSummary = {
  scanned: number;
  candidates: number;
  totalLamports: number;
  topLamports: number;
  skippedNonEmpty: number;
  skippedWrongAuthority: number;
  skippedBelowMinRent: number;
  skippedNotAllowedMint: number;
  parseErrors: number;
  examples: Array<{ tokenAccount: string; mint: string; lamports: number }>;
};

function lamportsToSol(l: number) {
  return l / 1_000_000_000;
}

function parseAllowMints(): Set<string> | null {
  const raw = process.env.ALLOW_MINTS;
  if (!raw) return null;

  const set = new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
  return set.size ? set : null;
}

async function scanReclaimable(owner: PublicKey): Promise<ScanSummary> {
  const resp = await connection.getTokenAccountsByOwner(owner, {
    programId: TOKEN_PROGRAM_ID,
  });

  const allowMints = parseAllowMints();

  let skippedNonEmpty = 0;
  let skippedWrongAuthority = 0;
  let skippedBelowMinRent = 0;
  let skippedNotAllowedMint = 0;
  let parseErrors = 0;

  const candidates: Array<{
    tokenAccount: PublicKey;
    mint: PublicKey;
    lamports: number;
  }> = [];

  for (const { pubkey } of resp.value) {
    try {
      const acc = await getAccount(connection, pubkey, CONFIG.commitment);

      if (acc.amount !== 0n) {
        skippedNonEmpty += 1;
        continue;
      }

      const closeAuth = acc.closeAuthority;
      if (closeAuth !== null && !closeAuth.equals(owner)) {
        skippedWrongAuthority += 1;
        continue;
      }

      const mintStr = acc.mint.toBase58();
      if (allowMints && !allowMints.has(mintStr)) {
        skippedNotAllowedMint += 1;
        continue;
      }

      const info = await connection.getAccountInfo(pubkey, CONFIG.commitment);
      const lamports = info?.lamports ?? 0;

      if (lamports < CONFIG.minRentLamports) {
        skippedBelowMinRent += 1;
        continue;
      }

      candidates.push({ tokenAccount: pubkey, mint: acc.mint, lamports });
    } catch (e) {
      parseErrors += 1;
      log.warn(
        { tokenAccount: pubkey.toBase58(), err: String(e) },
        "Skip: could not parse token account"
      );
    }
  }

  candidates.sort((a, b) => b.lamports - a.lamports);

  const totalLamports = candidates.reduce((sum, c) => sum + c.lamports, 0);
  const topLamports = candidates[0]?.lamports ?? 0;

  const examples = candidates.slice(0, 3).map((c) => ({
    tokenAccount: c.tokenAccount.toBase58(),
    mint: c.mint.toBase58(),
    lamports: c.lamports,
  }));

  return {
    scanned: resp.value.length,
    candidates: candidates.length,
    totalLamports,
    topLamports,
    skippedNonEmpty,
    skippedWrongAuthority,
    skippedBelowMinRent,
    skippedNotAllowedMint,
    parseErrors,
    examples,
  };
}

function formatSummary(owner: string, s: ScanSummary) {
  const totalSol = lamportsToSol(s.totalLamports).toFixed(6);
  const topSol = lamportsToSol(s.topLamports).toFixed(6);

  const lines: string[] = [];
  lines.push(`Owner: ${owner}`);
  lines.push(`Scanned: ${s.scanned}`);
  lines.push(`Reclaimable: ${s.candidates}`);
  lines.push(`Estimated rent: ${totalSol} SOL (top: ${topSol} SOL)`);
  lines.push(
    `Skipped: non-empty=${s.skippedNonEmpty}, wrong-auth=${s.skippedWrongAuthority}, below-min-rent=${s.skippedBelowMinRent}, not-allowed-mint=${s.skippedNotAllowedMint}, parse-errors=${s.parseErrors}`
  );

  if (s.examples.length) {
    lines.push("");
    lines.push("Top candidates:");
    for (const ex of s.examples) {
      lines.push(
        `- ${ex.tokenAccount} | mint ${ex.mint} | lamports ${ex.lamports}`
      );
    }
  }

  return lines.join("\n");
}

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  throw new Error("Missing TELEGRAM_BOT_TOKEN in .env");
}

const bot = new Bot(token);

// Per-chat watch timers (in-memory)
const watchers = new Map<number, NodeJS.Timeout>();

function getDefaultIntervalSec() {
  const v = Number(process.env.TELEGRAM_DEFAULT_INTERVAL_SEC ?? "60");
  return Number.isFinite(v) && v > 0 ? v : 60;
}

function getMinAlertLamports() {
  const v = Number(process.env.TELEGRAM_MIN_ALERT_LAMPORTS ?? "0");
  return Number.isFinite(v) && v >= 0 ? v : 0;
}

async function getOwnerPubkey(): Promise<PublicKey> {
  const operator = loadKeypairFromFile(CONFIG.ownerKeypairPath);
  return operator.publicKey;
}

bot.command("start", async (ctx) => {
  await ctx.reply(
    [
      "Rent Reclaim Notifier is running.",
      "",
      "Commands:",
      "/scan - scan for reclaimable empty token accounts",
      "/watch <seconds> - scan every N seconds and alert when reclaimable rent exists",
      "/stop - stop watch mode for this chat",
      "/status - show current config",
      "",
      "Note: This bot does NOT close accounts. It only reports.",
    ].join("\n")
  );
});

bot.command("status", async (ctx) => {
  await ctx.reply(
    [
      `RPC: ${CONFIG.solanaRpcUrl}`,
      `Commitment: ${CONFIG.commitment}`,
      `DRY_RUN: ${CONFIG.dryRun ? "1" : "0"}`,
      `USE_KORA: ${CONFIG.useKora ? "1" : "0"}`,
      `MAX_CLOSE_PER_RUN: ${CONFIG.maxClosePerRun}`,
      `MIN_RENT_LAMPORTS: ${CONFIG.minRentLamports}`,
      `ALLOW_MINTS: ${process.env.ALLOW_MINTS ? "set" : "not set"}`,
      `Default interval: ${getDefaultIntervalSec()}s`,
      `Alert threshold: ${getMinAlertLamports()} lamports`,
    ].join("\n")
  );
});

bot.command("scan", async (ctx) => {
  try {
    const owner = await getOwnerPubkey();
    const summary = await scanReclaimable(owner);
    await ctx.reply(formatSummary(owner.toBase58(), summary));
  } catch (e: any) {
    await ctx.reply(`Scan failed: ${e?.message || String(e)}`);
  }
});

bot.command("stop", async (ctx) => {
  const chatId = ctx.chat.id;
  const t = watchers.get(chatId);
  if (t) {
    clearInterval(t);
    watchers.delete(chatId);
    await ctx.reply("Watch mode stopped for this chat.");
  } else {
    await ctx.reply("Watch mode is not running in this chat.");
  }
});

bot.command("watch", async (ctx) => {
  const chatId = ctx.chat.id;

  // Parse `/watch 60`
  const parts = ctx.message?.text?.trim().split(/\s+/) ?? [];
  const intervalSec = Number(parts[1] ?? String(getDefaultIntervalSec()));
  const safeIntervalSec =
    Number.isFinite(intervalSec) && intervalSec >= 15 ? intervalSec : 60;

  // Replace existing watcher if present
  const existing = watchers.get(chatId);
  if (existing) {
    clearInterval(existing);
    watchers.delete(chatId);
  }

  const minAlert = getMinAlertLamports();
  await ctx.reply(
    `Watch mode enabled. Interval: ${safeIntervalSec}s. Alert threshold: ${minAlert} lamports.`
  );

  const tick = async () => {
    try {
      const owner = await getOwnerPubkey();
      const summary = await scanReclaimable(owner);

      if (summary.candidates > 0 && summary.totalLamports >= minAlert) {
        await ctx.reply(
          [
            "Reclaimable rent detected:",
            formatSummary(owner.toBase58(), summary),
          ].join("\n\n")
        );
      }
    } catch (e: any) {
      await ctx.reply(`Watch scan failed: ${e?.message || String(e)}`);
    }
  };

  // run once immediately, then interval
  await tick();
  const timer = setInterval(tick, safeIntervalSec * 1000);
  watchers.set(chatId, timer);
});

bot.catch((err) => {
  log.error({ err: String(err.error) }, "Telegram bot error");
});

log.info(
  { rpc: CONFIG.solanaRpcUrl, ownerKeypairPath: CONFIG.ownerKeypairPath },
  "Telegram notifier bot starting"
);

bot.start();
