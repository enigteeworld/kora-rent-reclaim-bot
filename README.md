# Automated Rent Reclaim Bot (for Kora Operators)

This repository contains a small Solana utility that helps operators reclaim SOL locked in **empty SPL token accounts**. It is designed with Kora operators in mind, but it can also be used as a standalone tool with any standard Solana keypair.

The bot is intentionally conservative and prioritizes safety, auditability, and clear reporting.

---

## What this tool does

- Scans all SPL token accounts owned by an operator wallet
- Identifies accounts that are safe to close:
  - token balance is zero
  - close authority is owned by the operator
  - rent reclaimed meets an optional minimum threshold
- Sorts reclaimable accounts by rent amount (highest first)
- Closes a limited number per run to avoid risky batch behavior
- Returns reclaimed SOL directly to the operator wallet
- Produces clear logs and optional JSON output for audits or automation

---

## Supported operation modes

- **One-time run**
- **Watch mode** (periodic scans, cron-style)
- **Dry run** (no on-chain changes)
- **JSON reporting** (machine-readable output)

---

## Safety model

This bot will **not**:

- Close token accounts with a non-zero balance
- Close token accounts the operator does not control
- Close accounts below a configurable rent threshold
- Execute transactions when `DRY_RUN=1`

An optional mint allowlist can also be used to further restrict which accounts are eligible.

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
  "ts": "2026-01-29T00:35:13.515Z",
  "scanned": 12,
  "candidates": 2,
  "planned": 2,
  "closed": 2,
  "signatures": ["<tx_sig_1>", "<tx_sig_2>"],
  "skippedNonEmpty": 8,
  "skippedWrongAuthority": 1,
  "skippedBelowMinRent": 1,
  "skippedNotAllowedMint": 0,
  "parseErrors": 0
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
## How Kora sponsorship fits

In direct mode (USE_KORA=0), the operator wallet signs and submits transactions directly and pays network fees.

In a Kora-sponsored flow, the operator would still approve the action (sign intent or transaction), but submission and/or fees can be handled by a sponsor via Kora’s infrastructure. This allows rent reclaim to run without requiring the operator to maintain SOL balances for fees.

In the codebase, this distinction is isolated to the transaction submission step. The core reclaim logic remains the same, and switching between direct and sponsored execution is handled via configuration.

## Why this exists

Operators tend to accumulate a lot of empty token accounts over time. Each one locks a small amount of SOL, and manually cleaning them up doesn’t scale. This tool automates that process in a way that’s predictable, inspectable, and safe to run unattended.

---


