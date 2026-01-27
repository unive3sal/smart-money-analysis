# AGENTS.md - Smart Money Analysis

Guidelines for AI coding agents working in this repository.

## Build & Development Commands

```bash
npm install          # Install dependencies
npm run dev          # Development server (localhost:3000)
npm run build        # Production build
npm run start        # Start production server
npm run lint         # Lint code
```

### TimesNet Python Service (optional)
```bash
cd timesnet-service && pip install -r requirements.txt && python main.py
```

## Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── api/               # API routes (route.ts files)
│   │   ├── chat/          # Chat endpoint (streaming SSE support)
│   │   ├── traders/       # Top traders leaderboard
│   │   ├── wallet/        # Wallet analysis
│   │   └── confidence/    # Confidence scoring
│   └── page.tsx           # Main dashboard
├── agent/                  # LLM agent with tools
│   ├── index.ts           # Main agent logic (chat + chatStream)
│   ├── providers/         # LLM provider adapters
│   │   └── openaiProxy.ts # OpenAI-compatible proxy with streaming
│   ├── tools/             # Tool definitions
│   └── toolExecutor.ts    # Tool implementations
├── components/            # React components
│   ├── ChatInterface.tsx  # Streaming chat UI
│   └── ui/               # Base UI components (shadcn-style)
├── services/              # Backend services
│   ├── birdeye/          # Birdeye API client
│   ├── features/         # Wallet feature extraction
│   ├── media/            # Social sentiment
│   └── confidence/       # Confidence scoring
└── lib/utils.ts           # Utilities (cn helper, formatters)
```

## Code Style Guidelines

### TypeScript
- **Strict mode enabled** - all types must be explicit
- Use `interface` for object shapes, `type` for unions/aliases
- Prefer `unknown` over `any`; use type guards when narrowing

### Imports
- Use path alias `@/*` for src imports
- Group: external packages → internal modules → types
- Destructure from single module when importing multiple items

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getBirdeyeClient } from "@/services/birdeye/client";
import { WalletFeatures } from "@/services/features/types";
```

### Naming Conventions
| Element | Convention | Example |
|---------|------------|---------|
| Component files | PascalCase.tsx | `ChatInterface.tsx` |
| Service files | camelCase.ts | `calculator.ts` |
| Interfaces/Types | PascalCase | `WalletFeatures` |
| Functions | camelCase | `calculateConfidence` |
| Constants | SCREAMING_SNAKE | `MAX_ITERATIONS` |
| API routes | route.ts in folder | `api/chat/route.ts` |

### React Components
- Use `"use client"` directive for client components
- Define prop interfaces above components

```typescript
"use client";

interface ChatInterfaceProps {
  initialPrompt?: string;
}

export function ChatInterface({ initialPrompt }: ChatInterfaceProps) {
  // ...
}
```

### API Routes
- Export `runtime` and `dynamic` constants
- Use response format: `{ success: boolean, data?: T, error?: string }`

```typescript
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const data = await fetchData();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown" },
      { status: 500 }
    );
  }
}
```

### Error Handling
- Always catch and log errors with context
- Use `instanceof Error` check before accessing `.message`
- Throw descriptive errors: `new Error("Context: specific issue")`

### Services Pattern
- Use singleton pattern with getter functions for API clients
- Keep types in separate `types.ts` files

```typescript
let client: MyClient | null = null;

export function getMyClient(): MyClient {
  if (!client) {
    client = new MyClient(process.env.API_KEY!);
  }
  return client;
}
```

### Formatting
- 2-space indentation, double quotes, semicolons required
- Trailing commas in multiline objects/arrays

### CSS/Styling
- Use TailwindCSS utility classes
- Use `cn()` helper for conditional classes
- Dark mode is default (class-based)

```tsx
<div className={cn("rounded-lg p-4", isActive && "bg-primary")} />
```

## Environment Variables

Required in `.env.local`:
```
BIRDEYE_API_KEY=xxx        # Birdeye API key
LLM_PROXY_URL=xxx          # OpenAI-compatible proxy URL  
LLM_PROXY_TOKEN=xxx        # Proxy authentication token
TIMESNET_SERVICE_URL=xxx   # Optional: TimesNet service
```

## Common Tasks

### Adding a New Agent Tool
1. Define tool in `src/agent/tools/index.ts`
2. Implement in `src/agent/toolExecutor.ts`
3. Add to `ALL_TOOLS` array in `src/agent/tools/index.ts`

## Agent Tools Reference

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `fetch_top_traders` | Top traders by PnL | `timeframe`: 30m-24h, `limit`: max 10 |
| `analyze_wallet` | Wallet holdings and transactions | `walletAddress` |
| `get_extracted_features` | Structured wallet metrics | `walletAddress` |
| `get_media_sentiment` | Social sentiment from LunarCrush/DexScreener | `tokenSymbol`, `tokenAddress` (optional) |
| `get_confidence_score` | Trade confidence with component breakdown | `tokenAddress`, `tokenSymbol` (optional) |
| `get_token_info` | Token details (price, mcap, volume) | `tokenAddress` |
| `search_token` | Search tokens by name/symbol | `query` |
| `get_trending_tokens` | Trending tokens on Solana | `limit`: max 20 |
| `get_timesnet_forecast` | AI price prediction (next 3h) | `tokenSymbol`, `tokenAddress` (optional) |
| `get_timesnet_anomaly` | Detect unusual patterns | `tokenSymbol`, `tokenAddress` (optional) |
| `get_timesnet_analysis` | Full AI analysis with signals | `tokenSymbol`, `tokenAddress` (optional) |

### TimesNet Service

The TimesNet service provides AI-powered market analysis:

- **Forecasting**: Predicts price direction and magnitude for next ~3 hours using 12h of historical data
- **Anomaly Detection**: Identifies whale activity, market manipulation, or unusual patterns
- **Combined Signals**: Generates trading signals (bullish/bearish/neutral) with confidence scores

The service uses 18 features including price, volume, technical indicators (RSI, MACD, Bollinger Bands), and smart money metrics.

### Adding a New API Route
1. Create folder: `src/app/api/{name}/`
2. Add `route.ts` with handlers and config exports

### Adding a New Service
1. Create folder: `src/services/{name}/`
2. Add `types.ts` and main logic file
3. Export singleton getter function

## Birdeye API Reference

The Birdeye API client is in `src/services/birdeye/client.ts`. Types must match actual API responses documented in `birdeye.md`.

### Key Endpoints & Constraints

| Endpoint | Key Parameters |
|----------|---------------|
| `/defi/v2/tokens/top_traders` | `time_frame`: 30m, 1h, 2h, 4h, 6h, 8h, 12h, 24h (NOT 7d/30d); `limit`: 1-10 |
| `/v1/wallet/token_list` | Returns `{ items: WalletToken[] }` |
| `/v1/wallet/tx_list` | Returns `{ solana: WalletTransaction[] }` - note chain name key |
| `/defi/token_overview` | Returns `TokenInfo` with `v24hUSD` for volume (not `volume24h`) |
| `/defi/history_price` | Requires `address_type=token` parameter |

### Response Type Notes
- `WalletTransaction.blockTime` is ISO string, not Unix timestamp
- Use `balanceChange[]` for token amounts (has `symbol`, `amount`, `address`)
- `TokenTransfer` only has `mint`, `tokenAmount`, `fromUserAccount`, `toUserAccount`

## Streaming Implementation

The chat supports SSE streaming via `chatStream()` in `src/agent/index.ts`:

```typescript
// Stream events
type StreamEvent =
  | { type: "content"; content: string }      // Text chunk
  | { type: "tool_start"; toolName: string }  // Tool execution started
  | { type: "tool_end"; toolName: string }    // Tool execution completed
  | { type: "done"; toolsUsed: string[] }     // Stream complete
  | { type: "error"; error: string };         // Error occurred
```

To add streaming to a new endpoint:
1. Use `chatStream()` instead of `chat()`
2. Return `ReadableStream` with SSE format (`data: {...}\n\n`)
3. End with `data: [DONE]\n\n`
