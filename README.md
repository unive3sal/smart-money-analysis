# Smart Money Analysis

Polymarket copytrade control center with browser-wallet authorization, copytrade task automation, trader discovery, market analysis, and an AI chat assistant.

## Features

- **Wallet authorization** — Authorize MetaMask or Phantom wallets and persist wallet/vault ownership records.
- **Copytrade task automation** — Create, inspect, pause, resume, stop, delete, and review performance for copytrade tasks.
- **Trader discovery** — Browse top traders and inspect recent activity before choosing a source account.
- **Market analysis** — View Polymarket market snapshots and TimesNet-backed analysis for a selected market.
- **AI chat assistant** — Use the chat panel or `/api/chat` to inspect markets, traders, wallets, and task state.
- **Background worker cycle** — Run the copytrade worker to seed trader data and process task lifecycle events.
- **Structured observability** — API and worker paths emit trace-aware logs and metrics.

## Tech Stack

- **Frontend**: Next.js 14, React 18, Tailwind CSS
- **Backend**: Next.js App Router API routes, TypeScript, Zod
- **Persistence**: Prisma + SQLite for local development
- **Agent layer**: Custom LLM proxy adapter with tool execution
- **Trading data**: Polymarket CLOB + Gamma service boundary
- **Forecasting**: External TimesNet service over HTTP

## Prerequisites

- Node.js 18+
- npm
- An LLM proxy URL and token for chat
- A running TimesNet service for market analysis
- Browser wallet extensions if you want to exercise the wallet auth flow in the UI

## Installation

```bash
npm install
cp .env.local.example .env.local
npm run db:push
```

## Environment Variables

Copy `.env.local.example` to `.env.local` and fill in the values you need:

```env
# LLM proxy (required for chat)
LLM_PROXY_URL=your_proxy_url
LLM_PROXY_TOKEN=your_proxy_token

# TimesNet service (external)
TIMESNET_SERVICE_URL=http://localhost:8000

# Local database (dev)
DATABASE_URL=file:./dev.db

# Polymarket endpoints
POLYMARKET_CLOB_URL=https://clob.polymarket.com
POLYMARKET_GAMMA_URL=https://gamma-api.polymarket.com
POLYMARKET_CHAIN_ID=137
POLYMARKET_PRIVATE_KEY=0x_your_private_key
POLYMARKET_FUNDER_ADDRESS=0x_your_polymarket_funder

# Local demo controls
ALLOW_DEMO_WALLET_AUTH=true
```

## Running the App

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Other useful commands:

```bash
npm run lint
npm run build
npm run start
npm run worker:copytrade
```

## Docker

The Docker setup runs the Next.js app only. TimesNet is expected to run as an external service.

```bash
docker compose up --build
```

## Dashboard Overview

The main page currently exposes four primary surfaces:

- **Wallet authorization & vaults** — connect supported wallets and inspect authorized vaults
- **Copy trade task automation** — create and manage copytrade tasks tied to authorized wallets
- **Top traders & live activity** — inspect trader leaderboard entries and recent actions
- **Market intelligence & AI analysis** — review market snapshots and TimesNet guidance
- **Chat + tools** — ask the assistant for operational context and summaries

## API Endpoints

| Endpoint | Method | Description |
| --- | --- | --- |
| `/api/chat` | `POST` | Chat with the AI agent; supports `stream: true` for SSE |
| `/api/chat` | `GET` | List available chat models |
| `/api/confidence?tokenSymbol=BTC` | `GET` | Return a heuristic confidence summary for a token |
| `/api/wallets` | `GET` | Get authorized wallets and vaults for the current session |
| `/api/auth/wallet/nonce` | `POST` | Create a wallet authorization nonce/message |
| `/api/auth/wallet/verify` | `POST` | Verify a wallet signature and create a session |
| `/api/copytrade/tasks` | `GET` | List copytrade tasks for the current session |
| `/api/copytrade/tasks` | `POST` | Create a copytrade task |
| `/api/copytrade/tasks/[taskId]` | `GET` | Inspect one copytrade task |
| `/api/copytrade/tasks/[taskId]` | `DELETE` | Delete a copytrade task |
| `/api/copytrade/tasks/[taskId]/pause` | `POST` | Pause a task |
| `/api/copytrade/tasks/[taskId]/resume` | `POST` | Resume a task |
| `/api/copytrade/tasks/[taskId]/stop` | `POST` | Stop a task |
| `/api/copytrade/tasks/[taskId]/performance` | `GET` | Fetch performance for a task |
| `/api/traders` | `GET` | List top Polymarket traders |
| `/api/traders/[address]/activity` | `GET` | Get recent activity for a trader |
| `/api/markets` | `GET` | List Polymarket markets |
| `/api/markets/[marketId]/analysis` | `GET` | Get TimesNet-backed market analysis |

## Development Notes

- Wallet and copytrade endpoints require a wallet-backed session.
- The UI currently uses seeded/demo wallet targets for local development, even though the signing flow prefers real browser wallet extensions.
- The copytrade worker seeds leaderboard data, then processes one worker cycle when you run `npm run worker:copytrade`.
- TimesNet is an advisory execution filter, not the sole trading decision-maker.
- The confidence endpoint is still heuristic and mixes real inputs with placeholder fields.
- SQLite is suitable for local development; production-style automation should use a more durable database and worker setup.
- There is currently no dedicated JavaScript test script in `package.json`; use `npm run lint` for the built-in project check.
