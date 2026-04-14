# AGENTS.md - Smart Money Analysis

Guidelines for AI coding agents working in this repository.

## Build & Development Commands

```bash
npm install
npm run dev
npm run build
npm run start
npm run lint
```

### TimesNet Advisory Service (optional)
```bash
# Run the external TimesNet runtime from ../Time-Series-Library
```

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── chat/          # Chat endpoint (SSE streaming)
│   │   └── confidence/    # Confidence scoring
│   └── page.tsx           # Main dashboard
├── agent/
│   ├── index.ts           # Main agent logic
│   ├── providers/         # LLM provider adapters
│   ├── tools/             # Tool definitions
│   └── toolExecutor.ts    # Tool implementations
├── components/
│   ├── ChatInterface.tsx  # Streaming chat UI
│   └── ui/                # Base UI components
├── services/
│   ├── marketData.ts      # CCXT-backed market data service
│   ├── timesnet/          # External TimesNet advisory client
│   ├── media/             # Social sentiment
│   └── confidence/        # Confidence scoring
└── lib/                   # Utilities and observability helpers
```

## Code Style Guidelines

### TypeScript
- Strict mode enabled
- Use `interface` for object shapes, `type` for unions/aliases
- Prefer `unknown` over `any` unless a third-party library forces looser typing

### Imports
- Use path alias `@/*` for src imports
- Group: external packages → internal modules → types

### API Routes
- Export `runtime` and `dynamic` where applicable
- Prefer response format: `{ success, data?, error?, meta? }`
- Emit structured logs/metric events with trace context at request boundaries

### Services Pattern
- Use singleton getter functions for API clients/services
- Normalize third-party payloads before returning them to routes/tools

## Environment Variables

Required in `.env.local`:
```env
CCXT_EXCHANGE_ID=binance
CCXT_DEFAULT_QUOTE=USDT
LLM_PROXY_URL=xxx
LLM_PROXY_TOKEN=xxx
TIMESNET_SERVICE_URL=xxx
```

## Agent Tools Reference

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `get_media_sentiment` | Social sentiment from LunarCrush/DexScreener | `tokenSymbol`, `tokenAddress` (optional) |
| `get_confidence_score` | Trade confidence with component breakdown | `tokenSymbol` |
| `get_token_info` | CCXT market info | `tokenSymbol` |
| `get_timesnet_forecast` | Advisory price forecast | `tokenSymbol` |
| `get_timesnet_anomaly` | Detect unusual patterns | `tokenSymbol` |
| `get_timesnet_analysis` | Full advisory analysis | `tokenSymbol` |

## Notes
- Birdeye-backed trader and wallet analysis flows have been removed.
- CCXT provides exchange market data; do not assume on-chain wallet analytics are available.
- TimesNet remains advisory-only.
