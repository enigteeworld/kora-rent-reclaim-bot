# Automated Rent Reclaim Bot (for Kora Operators)

This repository contains a small Solana utility that helps operators clean up **empty SPL token accounts** and reclaim the rent locked inside them. The tool was built with Kora operators in mind, but it can also be run standalone with a regular Solana keypair.

The goal is simple: scan an operator wallet, find token accounts that are safe to close, and automatically reclaim the SOL rent — without touching anything that shouldn’t be touched.

---

## What the bot does

* Scans all SPL token accounts owned by a given wallet
* Filters for accounts that:

  * have zero token balance
  * are actually closable by the operator
  * meet an optional minimum rent threshold
* Sorts candidates by reclaimable rent (highest first)
* Closes a limited number per run
* Sends reclaimed SOL back to the operator wallet
* Can run once or continuously on an interval
* Produces optional JSON output for logging or automation

---

## Safety first

This tool is intentionally conservative. It will **not**:

* close token accounts with a non‑zero balance
* attempt to close accounts it doesn’t control
* touch accounts below a configurable rent threshold
* send transactions when running in `DRY_RUN` mode

If you want to see what *would* be closed before doing anything on-chain, you can run the bot in dry-run mode and inspect the logs.

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

Example JSON output:

```json
{
  "ts": "2026-01-29T00:46:40.585Z",
  "scanned": 1,
  "candidates": 1,
  "planned": 1,
  "closed": 1,
  "signatures": ["<tx-signature>"]
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

* sponsored transaction fees
* RPC-based signing and submission
* operator-safe automation workflows

This keeps the bot usable today while making future Kora-native integration straightforward.

---

## Why this exists

Operators tend to accumulate a lot of empty token accounts over time. Each one locks a small amount of SOL, and manually cleaning them up doesn’t scale. This tool automates that process in a way that’s predictable, inspectable, and safe to run unattended.

---


