import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAccount,
  createCloseAccountInstruction,
} from "@solana/spl-token";
import { CONFIG } from "./config.js";
import { log } from "./logger.js";

type CloseCandidate = {
  tokenAccount: PublicKey;
  mint: PublicKey;
  owner: PublicKey;
  lamports: number;
};

export type ReclaimReport = {
  scanned: number; // total token accounts seen from RPC
  candidates: number; // total reclaimable candidates after filters
  planned: number; // number selected this run (after maxClosePerRun)
  closed: number; // number successfully closed
  signatures: string[];

  // bonus: skip stats (helps judges + debugging)
  skippedNonEmpty: number;
  skippedWrongAuthority: number;
  skippedBelowMinRent: number;
  skippedNotAllowedMint: number;
  parseErrors: number;
};

function parseAllowMints(): Set<string> | null {
  // Optional env hook: only allow closing accounts with these mints.
  // If not set, allow all mints.
  // NOTE: add ALLOW_MINTS to your config.ts if you want this configurable via CONFIG.
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

async function findEmptyTokenAccounts(
  conn: Connection,
  owner: PublicKey
): Promise<{
  scanned: number;
  candidates: CloseCandidate[];
  skipped: Omit<ReclaimReport, "planned" | "closed" | "signatures" | "candidates"> & {
    candidates: number; // not used here, but kept for shape clarity
  };
}> {
  const resp = await conn.getTokenAccountsByOwner(owner, {
    programId: TOKEN_PROGRAM_ID,
  });

  const allowMints = parseAllowMints();

  const out: CloseCandidate[] = [];

  let skippedNonEmpty = 0;
  let skippedWrongAuthority = 0;
  let skippedBelowMinRent = 0;
  let skippedNotAllowedMint = 0;
  let parseErrors = 0;

  for (const { pubkey } of resp.value) {
    try {
      const acc = await getAccount(conn, pubkey, CONFIG.commitment);

      // Must be empty to close (amount == 0)
      if (acc.amount !== 0n) {
        skippedNonEmpty += 1;
        continue;
      }

      // Only close if closeAuthority is null (defaults to owner) OR is owner.
      const closeAuth = acc.closeAuthority;
      if (closeAuth !== null && !closeAuth.equals(owner)) {
        skippedWrongAuthority += 1;
        continue;
      }

      // Optional mint allowlist
      if (allowMints && !allowMints.has(acc.mint.toBase58())) {
        skippedNotAllowedMint += 1;
        continue;
      }

      const info = await conn.getAccountInfo(pubkey, CONFIG.commitment);
      const lamports = info?.lamports ?? 0;

      // Optional: only reclaim if rent is "worth it"
      if (lamports < CONFIG.minRentLamports) {
        skippedBelowMinRent += 1;
        continue;
      }

      out.push({
        tokenAccount: pubkey,
        mint: acc.mint,
        owner: acc.owner,
        lamports,
      });
    } catch (e) {
      parseErrors += 1;
      log.warn(
        { tokenAccount: pubkey.toBase58(), err: String(e) },
        "Skip: could not parse token account"
      );
    }
  }

  return {
    scanned: resp.value.length,
    candidates: out,
    skipped: {
      scanned: resp.value.length,
      candidates: 0,
      skippedNonEmpty,
      skippedWrongAuthority,
      skippedBelowMinRent,
      skippedNotAllowedMint,
      parseErrors,
    },
  };
}

async function sendTransactionDirect(
  conn: Connection,
  tx: Transaction,
  signer: Keypair
): Promise<string> {
  tx.feePayer = signer.publicKey;
  tx.recentBlockhash = (
    await conn.getLatestBlockhash(CONFIG.commitment)
  ).blockhash;
  tx.sign(signer);

  const sig = await conn.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
  });
  await conn.confirmTransaction(sig, CONFIG.commitment);
  return sig;
}

// Placeholder: we keep Kora integration as a clean slot.
// In a sponsored flow, Kora would typically submit the transaction with a sponsor paying fees,
// while the operator still approves/signs the intent.
async function sendTransactionViaKora(): Promise<string> {
  throw new Error(
    "Kora send not wired yet. Set USE_KORA=0 for now, or implement the Kora-sponsored send here."
  );
}

export async function runReclaimer(
  conn: Connection,
  operator: Keypair
): Promise<ReclaimReport> {
  log.info(
    { owner: operator.publicKey.toBase58(), dryRun: CONFIG.dryRun },
    "Starting reclaim scan"
  );

  const { scanned, candidates, skipped } = await findEmptyTokenAccounts(
    conn,
    operator.publicKey
  );

  // Highest rent first (maximize reclaimed lamports)
  candidates.sort((a, b) => b.lamports - a.lamports);

  log.info(
    {
      found: candidates.length,
      scanned,
      maxClosePerRun: CONFIG.maxClosePerRun,
      skippedNonEmpty: skipped.skippedNonEmpty,
      skippedWrongAuthority: skipped.skippedWrongAuthority,
      skippedBelowMinRent: skipped.skippedBelowMinRent,
      skippedNotAllowedMint: skipped.skippedNotAllowedMint,
      parseErrors: skipped.parseErrors,
    },
    "Candidates found"
  );

  const picked = candidates.slice(0, CONFIG.maxClosePerRun);

  const report: ReclaimReport = {
    scanned,
    candidates: candidates.length,
    planned: picked.length,
    closed: 0,
    signatures: [],

    skippedNonEmpty: skipped.skippedNonEmpty,
    skippedWrongAuthority: skipped.skippedWrongAuthority,
    skippedBelowMinRent: skipped.skippedBelowMinRent,
    skippedNotAllowedMint: skipped.skippedNotAllowedMint,
    parseErrors: skipped.parseErrors,
  };

  for (const c of picked) {
    log.info(
      {
        tokenAccount: c.tokenAccount.toBase58(),
        mint: c.mint.toBase58(),
        rentLamports: c.lamports,
      },
      "Closing empty token account"
    );

    if (CONFIG.dryRun) continue;

    const ix = createCloseAccountInstruction(
      c.tokenAccount,
      operator.publicKey, // reclaimed SOL destination
      operator.publicKey // close authority
    );

    const tx = new Transaction().add(ix);

    const sig = CONFIG.useKora
      ? await sendTransactionViaKora()
      : await sendTransactionDirect(conn, tx, operator);

    report.closed += 1;
    report.signatures.push(sig);

    log.info({ sig }, "Closed token account successfully");
  }

  log.info(
    { planned: report.planned, closed: report.closed, dryRun: CONFIG.dryRun },
    "Run complete"
  );

  return report;
}
