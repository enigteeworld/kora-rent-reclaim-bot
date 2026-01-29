# Kora Automated Rent Reclaim Bot (Solana)

An automated bot that scans a Solana operator wallet for **empty SPL Token accounts** and safely **reclaims rent** by closing them. Designed for **Kora operators**, but works in standalone mode as well.

This project was built as a submission for the **Superteam Beginner Developer Challenge – Automated Rent Reclaim Bot for Kora Operators**.

---

##  What this bot does

* Scans all SPL token accounts owned by an operator wallet
* Identifies accounts that are:

  * empty (`amount == 0`)
  * safely closable by the operator
  * above a configurable rent threshold
* Sorts candidates by **highest rent first**
* Closes a limited number per run
* Reclaims SOL rent back to the operator wallet
* Supports **dry‑run**, **one‑shot**, and **watch (interval)** modes
* Outputs a **machine‑readable JSON report** for automation & auditing

---

## Safety guarantees

This bot is intentionally conservative:

* Only scans token accounts **owned by the operator wallet**
* Skips non‑empty token accounts
* Skips accounts with an incompatible `closeAuthority`
* Optional minimum rent threshold (`MIN_RENT_LAMPORTS`)
* `DRY_RUN=1` mode for inspection before any on‑chain action
* Optional Kora transaction path (stubbed, opt‑in)

No accounts are closed unless all checks pass.

---




## Project structure

```
src/
├─ index.ts        // entry point, CLI + watch loop
├─ reclaim.ts      // core reclaim logic
├─ cli.ts          // CLI flags parsing
├─ config.ts       // environment configuration
├─ solana.ts       // RPC connection
├─ keys.ts         // keypair loading
├─ logger.ts       // structured logging
```

---

## Configuration

Create a `.env` file in the project root:

```env
SOLANA_RPC_URL=https://api.devnet.solana.com
OWNER_KEYPAIR_PATH=/absolute/path/to/operator.json

DRY_RUN=1
USE_KORA=0

MAX_CLOSE_PER_RUN=25
MIN_RENT_LAMPORTS=0
COMMITMENT=confirmed
LOG_LEVEL=info
```

* `DRY_RUN=1` is strongly recommended for first runs
* `USE_KORA` is currently a stub, but the hook is already in place

---

## Running the bot

Install dependencies:

```bash
npm install
```

### One-time scan

```bash
npm run dev -- --once
```

### One-time scan with JSON output

```bash
npm run dev -- --once --json
```

## Reporting and audit output

When run with --json, the tool prints a structured report containing:

scanned – total token accounts inspected

candidates – accounts eligible for reclaim

planned – accounts selected this run

closed – accounts successfully closed

signatures – transaction signatures

skip counters explaining why accounts were ignored:

skippedNonEmpty

skippedWrongAuthority

skippedBelowMinRent

skippedNotAllowedMint

parseErrors

Example JSON output:

```json
{
  "ts": "2026-01-29T00:46:40.585Z",
  "scanned": 1,
  "candidates": 1,
  "planned": 1,
  "closed": 1,
  "signatures": [
    "3SMgfdRrfvVJCPHmJX1B6ZRtvwVZeCAoEJGuJrpHmQrjXeDvZ6xNA8wfJ6mTD6Q3D9tBqFwxrfG33GKVoDm8Pq58"
  ]
}
```

### Continuous watch mode

```bash
npm run dev -- --watch --interval 30
```

This will rescan the wallet every 30 seconds until stopped.

---

## Devnet demo (recommended)

For testing and review, devnet is the easiest place to start:

```bash
solana config set --url https://api.devnet.solana.com
solana airdrop 1 ~/operator.json
```

Create a test token account, mint and burn tokens so the account becomes empty, then run:

```bash
npm run dev -- --once --json
```

The bot should detect the empty account and close it, reclaiming the rent.

---

## Kora integration notes

The code includes a clean abstraction for submitting transactions via Kora. At the moment this path is stubbed out, but the structure is intentionally designed to support:

* Sponsored fees
* `signAndSendTransaction` JSON‑RPC
* Operator‑safe automation

---


Built with ❤️ on Solana for Kora operators.
