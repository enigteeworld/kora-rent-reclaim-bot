# Kora Automated Rent Reclaim Bot (Solana)

An automated bot that scans a Solana operator wallet for **empty SPL Token accounts** and safely **reclaims rent** by closing them. Designed for **Kora operators**, but works in standalone mode as well.

This project was built as a submission for the **Superteam Beginner Developer Challenge – Automated Rent Reclaim Bot for Kora Operators**.

---

## ✨ What this bot does

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

## 🛡️ Safety guarantees

This bot is intentionally conservative:

* Only scans token accounts **owned by the operator wallet**
* Skips non‑empty token accounts
* Skips accounts with an incompatible `closeAuthority`
* Optional minimum rent threshold (`MIN_RENT_LAMPORTS`)
* `DRY_RUN=1` mode for inspection before any on‑chain action
* Optional Kora transaction path (stubbed, opt‑in)

No accounts are closed unless all checks pass.

---

## 🧱 Architecture overview

```
src/
├─ index.ts        # Entry point, CLI + watch loop
├─ reclaim.ts      # Core reclaim logic
├─ cli.ts          # CLI flags parsing
├─ config.ts       # Env config
├─ solana.ts       # RPC connection
├─ keys.ts         # Keypair loader
├─ logger.ts       # Structured logging
```

---

## ⚙️ Configuration (.env)

Create a `.env` file in the project root:

```env
SOLANA_RPC_URL=https://api.devnet.solana.com
OWNER_KEYPAIR_PATH=/absolute/path/to/kora-operator.json

DRY_RUN=1
USE_KORA=0

MAX_CLOSE_PER_RUN=25
MIN_RENT_LAMPORTS=0
COMMITMENT=confirmed
LOG_LEVEL=info
```

---

## 🚀 Usage

### Install dependencies

```bash
npm install
```

### One‑time dry run (recommended)

```bash
npm run dev -- --once
```

### One‑time run with JSON output

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
  "signatures": [
    "3SMgfdRrfvVJCPHmJX1B6ZRtvwVZeCAoEJGuJrpHmQrjXeDvZ6xNA8wfJ6mTD6Q3D9tBqFwxrfG33GKVoDm8Pq58"
  ]
}
```

### Watch mode (continuous reclaim)

```bash
npm run dev -- --watch --interval 30
```

Scans every 30 seconds until stopped.

---

## 🧪 Devnet demo (recommended for reviewers)

1. Switch to devnet

```bash
solana config set --url https://api.devnet.solana.com
```

2. Fund operator wallet

```bash
solana airdrop 1 ~/kora-operator.json
```

3. Create a test token account, mint & burn tokens

4. Run the bot

```bash
npm run dev -- --once --json
```

The bot will detect the empty token account and close it, reclaiming rent.

---

## 🔌 Kora integration (future‑ready)

The bot includes a clean abstraction for Kora‑based transaction submission:

```ts
USE_KORA=1
```

Currently stubbed, but designed to support:

* Sponsored fees
* `signAndSendTransaction` JSON‑RPC
* Operator‑safe automation

---

## 🏆 Why this fits the bounty

* Real on‑chain execution (not a mock)
* Clear operator safety model
* Production‑ready structure
* Auditable JSON reports
* Easy extension for Kora infra

---

## 📜 License

MIT

---

Built with ❤️ on Solana for Kora operators.
