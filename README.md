# Smart Money Analysis

Track and analyze smart money movements on Solana. Identify top-performing traders, extract trading patterns, and get AI-powered insights.

## Features

- **Smart Money Leaderboard** - Track top traders by volume across different timeframes (1h, 4h, 12h, 24h)
- **Wallet Analysis** - Deep dive into wallet holdings, transactions, and trading patterns
- **Feature Extraction** - Structured metrics for trading behavior, performance, and risk profile
- **Confidence Scoring** - Combined analysis of smart money activity, media sentiment, and risk factors
- **AI Chat Assistant** - Streaming conversational interface with multi-model LLM support (GPT-4, Claude, Gemini)
- **Real-time Streaming** - Token-by-token streaming responses with live tool execution status
- **Media Sentiment** - Social sentiment tracking via LunarCrush and DexScreener
- **TimesNet AI Analysis** - Price prediction and anomaly detection using deep learning (optional)

## Tech Stack

- **Frontend**: Next.js 14, React 18, TailwindCSS, shadcn/ui
- **Backend**: Next.js API Routes, TypeScript
- **AI Agent**: Custom LLM proxy adapter with tool execution
- **Data**: Birdeye API, LunarCrush, DexScreener
- **ML Service**: Python FastAPI + TimesNet (optional)

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Birdeye API key (free tier available)
- LLM proxy URL and token

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/smart-money-analysis.git
cd smart-money-analysis

# Install dependencies
npm install

# Configure environment variables
cp .env.local.example .env.local
# Edit .env.local with your API keys
```

### Environment Variables

Create a `.env.local` file:

```env
# Birdeye API (required)
BIRDEYE_API_KEY=your_birdeye_api_key

# LLM Proxy (required for chat)
LLM_PROXY_URL=your_proxy_url
LLM_PROXY_TOKEN=your_proxy_token

# TimesNet Service (optional)
TIMESNET_SERVICE_URL=http://localhost:8000
```

### Running the App

```bash
# Development
npm run dev

# Production build
npm run build
npm run start
```

Open [http://localhost:3000](http://localhost:3000) to view the dashboard.

### TimesNet Service (Optional)

For time series predictions:

```bash
cd timesnet-service
pip install -r requirements.txt
python main.py
```

## Project Structure

```
smart-money-analysis/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/               # API endpoints
│   │   │   ├── chat/          # LLM chat endpoint
│   │   │   ├── traders/       # Top traders data
│   │   │   ├── wallet/        # Wallet analysis
│   │   │   └── confidence/    # Confidence scoring
│   │   └── page.tsx           # Main dashboard
│   ├── agent/                  # LLM agent
│   │   ├── index.ts           # Agent with tool loop
│   │   ├── tools/             # Tool definitions
│   │   └── toolExecutor.ts    # Tool implementations
│   ├── components/            # React components
│   │   ├── ChatInterface.tsx  # AI chat UI
│   │   ├── TraderLeaderboard.tsx
│   │   └── ui/               # Base components
│   └── services/              # Backend services
│       ├── birdeye/          # Birdeye API client
│       ├── features/         # Feature extraction
│       ├── media/            # Sentiment analysis
│       └── confidence/       # Confidence calculator
├── timesnet-service/          # Python ML service
└── AGENTS.md                  # AI agent guidelines
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/chat` | POST | Chat with AI agent (supports `stream: true` for SSE streaming) |
| `/api/chat` | GET | Get available models |
| `/api/traders` | GET | Top traders leaderboard (`timeframe`: 30m, 1h, 2h, 4h, 6h, 8h, 12h, 24h) |
| `/api/wallet/[address]` | GET | Wallet feature analysis |
| `/api/confidence` | GET | Token confidence score |

### Streaming Chat

The chat endpoint supports Server-Sent Events (SSE) streaming:

```javascript
const response = await fetch("/api/chat", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    modelId: "gpt-4o-mini",
    messages: [{ role: "user", content: "What's trending?" }],
    stream: true  // Enable streaming
  }),
});

const reader = response.body.getReader();
// Read SSE events: content, tool_start, tool_end, done, error
```

## Agent Tools

The AI assistant has access to these tools:

| Tool | Description |
|------|-------------|
| `fetch_top_traders` | Get top traders by volume (timeframes: 30m-24h) |
| `analyze_wallet` | Wallet holdings and transactions |
| `get_extracted_features` | Structured wallet metrics (trading behavior, performance, risk) |
| `get_media_sentiment` | Social sentiment data from LunarCrush/DexScreener |
| `get_confidence_score` | Trading signal confidence with component breakdown |
| `get_token_info` | Token details (price, market cap, liquidity, holders) |
| `search_token` | Search tokens by name/symbol |
| `get_trending_tokens` | Currently trending tokens on Solana |
| `get_timesnet_forecast` | AI-powered price prediction for next few hours |
| `get_timesnet_anomaly` | Detect unusual trading patterns (whale activity, manipulation) |
| `get_timesnet_analysis` | Comprehensive AI analysis with forecast + anomaly detection |

## Example Queries

Try these prompts in the chat:

- "Who are the top traders this week?"
- "Analyze wallet ABC123..."
- "What's the confidence score for BONK?"
- "What tokens is smart money buying?"
- "Show me trending tokens on Solana"
- "Predict the price direction for SOL"
- "Detect any anomalies or whale activity on BONK"
- "Give me a full AI analysis for JUP"

## Screenshots

*Dashboard with leaderboard and chat interface*

## License

This project is licensed under the GNU General Public License v3.0 - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [Birdeye](https://birdeye.so/) - Solana data API
- [LunarCrush](https://lunarcrush.com/) - Social sentiment data
- [DexScreener](https://dexscreener.com/) - DEX data
- [shadcn/ui](https://ui.shadcn.com/) - UI components
