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
│   └── page.tsx           # Main dashboard
├── agent/                  # LLM agent with tools
│   ├── index.ts           # Main agent logic
│   ├── tools/             # Tool definitions
│   └── toolExecutor.ts    # Tool implementations
├── components/            # React components
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

### Adding a New API Route
1. Create folder: `src/app/api/{name}/`
2. Add `route.ts` with handlers and config exports

### Adding a New Service
1. Create folder: `src/services/{name}/`
2. Add `types.ts` and main logic file
3. Export singleton getter function
