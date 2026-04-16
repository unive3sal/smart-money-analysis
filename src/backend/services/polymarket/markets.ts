import { getPolymarketService } from "@/backend/services/polymarket/client";
import type { PolymarketMarket } from "@/backend/services/polymarket/types";

const fallbackMarkets: PolymarketMarket[] = [
  {
    marketId: "us-recession-2026",
    tokenId: "2001",
    slug: "us-recession-2026",
    question: "Will the US enter a recession in 2026?",
    description: "Macro market pricing for a US recession outcome in 2026.",
    outcomes: ["Yes", "No"],
    active: true,
    closed: false,
    volume24h: 2350000,
    liquidity: 910000,
    lastPrice: 0.38,
    bestBid: 0.37,
    bestAsk: 0.39,
    spread: 0.02,
    priceChange24h: 0.041,
    tickSize: "0.01",
    negRisk: false,
    tags: ["macro", "economy"],
  },
  {
    marketId: "eth-5k-2026",
    tokenId: "2002",
    slug: "eth-5k-2026",
    question: "Will ETH reach $5,000 before 2027?",
    description: "Crypto upside pricing for ETH.",
    outcomes: ["Yes", "No"],
    active: true,
    closed: false,
    volume24h: 1820000,
    liquidity: 640000,
    lastPrice: 0.46,
    bestBid: 0.45,
    bestAsk: 0.47,
    spread: 0.02,
    priceChange24h: -0.022,
    tickSize: "0.01",
    negRisk: false,
    tags: ["crypto", "ethereum"],
  },
  {
    marketId: "trump-2028-primary",
    tokenId: "2003",
    slug: "trump-2028-primary",
    question: "Will Trump win the 2028 GOP primary?",
    description: "Political market with strong retail activity.",
    outcomes: ["Yes", "No"],
    active: true,
    closed: false,
    volume24h: 3040000,
    liquidity: 1200000,
    lastPrice: 0.57,
    bestBid: 0.56,
    bestAsk: 0.58,
    spread: 0.02,
    priceChange24h: 0.014,
    tickSize: "0.01",
    negRisk: true,
    tags: ["politics"],
  },
];

export function getFallbackPolymarketMarkets() {
  return fallbackMarkets;
}

export async function listPolymarketMarkets() {
  try {
    return await getPolymarketService().listMarkets();
  } catch {
    return fallbackMarkets;
  }
}

export async function getPolymarketMarket(marketId: string) {
  const markets = await listPolymarketMarkets();
  const market = markets.find(
    (entry) => entry.marketId === marketId || entry.slug === marketId || entry.tokenId === marketId
  );

  if (!market) {
    throw new Error(`Market ${marketId} not found`);
  }

  return market;
}
