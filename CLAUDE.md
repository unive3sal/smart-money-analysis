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
- `cd timesnet-service && pip install -r requirements.txt` — install Python dependencies
- `cd timesnet-service && python main.py` — run the FastAPI TimesNet service locally

### Docker
- `docker compose up --build` — run the unified container with Next.js on `:3000` and TimesNet on `:8001`

## Environment

Expected local env vars are documented in `README.md` and used by runtime code:
- `BIRDEYE_API_KEY`
- `LLM_PROXY_URL`
- `LLM_PROXY_TOKEN`
- `TIMESNET_SERVICE_URL`
- `CHECKPOINT_PATH` (used by the container / Python service)

## Architecture overview

This repository is a Next.js 14 App Router application with a Python FastAPI sidecar for TimesNet forecasting/anomaly detection.

### Main request flow
1. The UI in `src/app/page.tsx` renders two primary surfaces: `TraderLeaderboard` and `ChatInterface`.
2. `ChatInterface` talks to `src/app/api/chat/route.ts`, which supports both JSON responses and SSE streaming.
3. The chat route delegates to `src/agent/index.ts`, which runs an LLM tool loop against an OpenAI-compatible proxy.
4. Tool calls are dispatched by `src/agent/toolExecutor.ts` into backend services under `src/services/**`.
5. TimesNet-related tools ultimately call the Python service in `timesnet-service/main.py` through `TIMESNET_SERVICE_URL`.

### Frontend / API split
- `src/app/**` contains the App Router pages and API routes.
- `src/components/**` contains the client UI, especially the leaderboard/chat dashboard.
- The app is effectively a thin UI over API routes and agent orchestration; most business logic lives outside React components.

### Agent architecture
- `src/agent/index.ts` is the core orchestration layer. It builds the system prompt, sends messages to the proxy model, executes tool calls, appends tool outputs back into the conversation, and repeats until the model returns a final answer.
- `chatStream()` in the same file mirrors the same loop but emits incremental SSE events (`content`, `tool_start`, `tool_end`, `done`, `error`) for the frontend.
- Tool schemas live in `src/agent/tools/index.ts`; implementations live in `src/agent/toolExecutor.ts`. When adding a tool, both places need to change.

### Service boundaries
- `src/services/birdeye/client.ts` is the main external data gateway. It wraps Birdeye endpoints with:
  - sequential request queueing,
  - a simple in-memory TTL cache,
  - retry/backoff for rate limits.
- `src/services/features/extractor.ts` derives wallet-level features from Birdeye portfolio + transaction data.
- `src/services/confidence/calculator.ts` combines smart-money, media, technical, and token-risk signals into a single score and trading signal.
- `src/services/media/sentiment.ts` is the sentiment layer used by confidence/agent tools.

### TimesNet service
- `timesnet-service/main.py` exposes FastAPI endpoints for forecast, anomaly detection, and combined analysis.
- It loads TimesNet models on startup via `models/timesnet_inference.py` and can optionally call back into the JS app’s `/api/chat` endpoint for natural-language interpretation.
- The Docker image is intentionally unified: Next.js and the TimesNet service run in the same container under `supervisord`.

## Important repository-specific constraints

- Birdeye top traders does **not** support `12h` on Solana in the current implementation. Valid values in `src/services/birdeye/client.ts` / `src/agent/toolExecutor.ts` are `30m`, `1h`, `2h`, `4h`, `6h`, `8h`, and `24h`.
- Wallet transaction `blockTime` is treated as an ISO string, not a Unix timestamp, throughout feature extraction.
- The confidence calculator currently mixes real inputs with some placeholders in `src/agent/toolExecutor.ts` for smart-money aggregates and token age; treat confidence output as heuristic unless those inputs are improved.
- There is no dedicated JS test setup or test script in `package.json` right now. Do not invent test commands in this repo.

## Working conventions derived from the code

- API routes use App Router `route.ts` handlers and are written for the Node runtime.
- Most API responses follow `{ success, data, error }` JSON envelopes, except SSE streaming responses from `/api/chat`.
- Internal imports use the `@/` alias for `src/*`.
- The repo already contains `AGENTS.md`; keep `CLAUDE.md` focused on operational guidance and cross-file architecture rather than duplicating style rules.
