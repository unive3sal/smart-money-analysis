# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development commands

### Next.js app
- `npm install` — install JS dependencies
- `npm run dev` — start the app locally on port 3000
- `npm run build` — production build
- `npm run start` — run the built app
- `npm run lint` — run Next.js linting

### TimesNet service
- Run the external TimesNet service from `../Time-Series-Library` and point `TIMESNET_SERVICE_URL` at it.

### Docker
- `docker compose up --build` — run the app locally; TimesNet should be provided by an external service boundary

## Environment

Expected local env vars are documented in `README.md` and used by runtime code:
- `CCXT_EXCHANGE_ID`
- `CCXT_DEFAULT_QUOTE`
- `LLM_PROXY_URL`
- `LLM_PROXY_TOKEN`
- `TIMESNET_SERVICE_URL`
- `CHECKPOINT_PATH` is no longer owned by this repo once TimesNet is externalized

## Architecture overview

This repository is a Next.js 14 App Router application that consumes external CCXT-backed market data and an external TimesNet forecasting/anomaly-detection service over HTTP.

### Main request flow
1. The UI in `src/app/page.tsx` renders a market-data summary panel and `ChatInterface`.
2. `ChatInterface` talks to `src/app/api/chat/route.ts`, which supports both JSON responses and SSE streaming.
3. The chat route delegates to `src/agent/index.ts`, which runs an LLM tool loop against an OpenAI-compatible proxy.
4. Tool calls are dispatched by `src/agent/toolExecutor.ts` into backend services under `src/services/**`.
5. TimesNet-related tools use CCXT-backed OHLCV history and call an external TimesNet service through `TIMESNET_SERVICE_URL`.

### Frontend / API split
- `src/app/**` contains the App Router pages and API routes.
- `src/components/**` contains the client UI.
- The app is a thin UI over API routes and agent orchestration; most business logic lives outside React components.

### Agent architecture
- `src/agent/index.ts` is the core orchestration layer. It builds the system prompt, sends messages to the proxy model, executes tool calls, appends tool outputs back into the conversation, and repeats until the model returns a final answer.
- `chatStream()` in the same file mirrors the same loop but emits incremental SSE events (`content`, `tool_start`, `tool_end`, `done`, `error`) for the frontend.
- Tool schemas live in `src/agent/tools/index.ts`; implementations live in `src/agent/toolExecutor.ts`. When adding a tool, both places need to change.

### Service boundaries
- `src/services/marketData.ts` is the CCXT-backed market data gateway. It loads exchange markets, resolves symbols, fetches ticker data, and fetches OHLCV history.
- `src/services/confidence/calculator.ts` combines market, media, technical, and token-risk signals into a single score and trading signal.
- `src/services/media/sentiment.ts` is the sentiment layer used by confidence/agent tools.
- `src/services/timesnet/client.ts` is the external TimesNet runtime boundary.

### TimesNet service
- TimesNet is consumed through `src/services/timesnet/client.ts` via `TIMESNET_SERVICE_URL`.
- The external service may live in `../Time-Series-Library` and remains advisory-only for this app.
- Treat TimesNet outputs as token-level analysis support, not transaction-level execution gating.

## Important repository-specific constraints

- The repo no longer supports Birdeye-backed trader or wallet endpoints.
- CCXT is exchange-market oriented; do not assume on-chain wallet analytics or top-trader leaderboards exist.
- The confidence calculator currently mixes real inputs with placeholders in `src/agent/toolExecutor.ts`; treat confidence output as heuristic unless those inputs are improved.
- There is no dedicated JS test setup or test script in `package.json` right now. Do not invent test commands in this repo.

## Working conventions derived from the code

- API routes use App Router `route.ts` handlers and are written for the Node runtime.
- Most API responses follow `{ success, data, error }` JSON envelopes, except SSE streaming responses from `/api/chat`.
- Internal imports use the `@/` alias for `src/*`.
- The repo already contains `AGENTS.md`; keep `CLAUDE.md` focused on operational guidance and cross-file architecture rather than duplicating style rules.
