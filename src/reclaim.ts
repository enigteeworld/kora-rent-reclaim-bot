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
  scanned: number;
  candidates: number;
  planned: number;
  closed: number;
  signatures: string[];
};

async function findEmptyTokenAccounts(
  conn: Connection,
  owner: PublicKey
): Promise<CloseCandidate[]> {
  const resp = await conn.getTokenAccountsByOwner(owner, {
    programId: TOKEN_PROGRAM_ID,
  });

  const out: CloseCandidate[] = [];

  for (const { pubkey } of resp.value) {
    try {
      const acc = await getAccount(conn, pubkey, CONFIG.commitment);

      // Must be empty to close (amount == 0)
      if (acc.amount !== 0n) continue;

      // Only close if closeAuthority is null (defaults to owner) OR is owner.
      // This avoids trying to close accounts you don't control.
      const closeAuth = acc.closeAuthority;
      if (closeAuth !== null && !closeAuth.equals(owner)) continue;

      const info = await conn.getAccountInfo(pubkey, CONFIG.commitment);
      const lamports = info?.lamports ?? 0;

      // Optional: only reclaim if rent is "worth it"
      if (lamports < CONFIG.minRentLamports) continue;

      out.push({
        tokenAccount: pubkey,
        mint: acc.mint,
        owner: acc.owner,
        lamports,
      });
    } catch (e) {
      log.warn(
        { tokenAccount: pubkey.toBase58(), err: String(e) },
        "Skip: could not parse token account"
      );
    }
  }

  return out;
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
// Kora supports JSON-RPC methods like signAndSendTransaction.
async function sendTransactionViaKora(): Promise<string> {
  throw new Error(
    "Kora send not wired yet. Set USE_KORA=0 for now, or we’ll add @solana/kora in Phase 3."
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

  const candidates = await findEmptyTokenAccounts(conn, operator.publicKey);

  // Highest rent first (maximize reclaimed lamports)
  candidates.sort((a, b) => b.lamports - a.lamports);

  log.info(
    { found: candidates.length, maxClosePerRun: CONFIG.maxClosePerRun },
    "Candidates found"
  );

  const picked = candidates.slice(0, CONFIG.maxClosePerRun);

  const report: ReclaimReport = {
    scanned: candidates.length, // effectively "eligible + parsed" after filters
    candidates: candidates.length,
    planned: picked.length,
    closed: 0,
    signatures: [],
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
      c.tokenAccount, // account to close
      operator.publicKey, // destination for reclaimed SOL
      operator.publicKey // owner / close authority
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
    { closedPlanned: picked.length, dryRun: CONFIG.dryRun },
    "Run complete"
  );

  return report;
}
