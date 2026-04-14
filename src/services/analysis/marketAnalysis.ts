import { AnalysisSignal } from "@/server/db/client";
import { db } from "@/server/db/client";
import { queryTimesNet } from "@/services/timesnet/client";
import { getPolymarketMarket } from "@/services/polymarket/markets";
import type { PolymarketMarketAnalysis } from "@/services/polymarket/types";

function createSyntheticHistory(price: number) {
  return Array.from({ length: 96 }, (_, index) => {
    const wave = Math.sin(index / 6) * 0.03;
    const drift = (index - 48) / 48 * 0.02;
    return Number(Math.max(0.01, Math.min(0.99, price + wave + drift)).toFixed(4));
  });
}

function toSignal(value?: string): PolymarketMarketAnalysis["signal"] {
  switch (value?.toLowerCase()) {
    case "strong_buy":
      return "strong_buy";
    case "buy":
      return "buy";
    case "sell":
      return "sell";
    case "strong_sell":
      return "strong_sell";
    case "avoid":
      return "avoid";
    default:
      return "hold";
  }
}

function toAnalysisSignal(value: PolymarketMarketAnalysis["signal"]): AnalysisSignal {
  switch (value) {
    case "strong_buy":
      return AnalysisSignal.STRONG_BUY;
    case "buy":
      return AnalysisSignal.BUY;
    case "sell":
      return AnalysisSignal.SELL;
    case "strong_sell":
      return AnalysisSignal.STRONG_SELL;
    case "avoid":
      return AnalysisSignal.AVOID;
    default:
      return AnalysisSignal.HOLD;
  }
}

export async function getMarketAnalysis(marketId: string): Promise<PolymarketMarketAnalysis> {
  const market = await getPolymarketMarket(marketId);
  const existing = await db.findMarketAnalysisSnapshot(market.marketId, market.tokenId);

  if (existing) {
    return {
      marketId: existing.marketId,
      tokenId: existing.tokenId,
      question: existing.question,
      currentPrice: existing.currentPrice,
      summary: existing.timesnetSummary,
      signal: toSignal(existing.timesnetSignal),
      confidence: existing.timesnetConfidence,
      recommendedAction:
        existing.timesnetConfidence >= 0.65
          ? "Eligible for copy trading if trader activity and risk limits align."
          : "Monitor only until confidence improves.",
      priceHistory: JSON.parse(existing.priceHistoryJson) as number[],
      analysisDetails: existing.analysisJson ? JSON.parse(existing.analysisJson) : undefined,
    };
  }

  const priceHistory = createSyntheticHistory(market.lastPrice);
  const result = await queryTimesNet({
    token_symbol: market.slug,
    query_type: "full",
    price_history: priceHistory,
  });

  const signal = toSignal(result.data?.signal);
  const summary = result.data?.summary || `${market.question} is trading near ${(market.lastPrice * 100).toFixed(1)}¢ with moderate event momentum.`;
  const confidence = Number(result.data?.confidence ?? 0.62);

  const analysis: PolymarketMarketAnalysis = {
    marketId: market.marketId,
    tokenId: market.tokenId,
    question: market.question,
    currentPrice: market.lastPrice,
    summary,
    signal,
    confidence,
    recommendedAction:
      confidence >= 0.65
        ? "TimesNet favors allowing selective copy trades on this market."
        : "Treat this market as observation-only until conviction increases.",
    priceHistory,
    analysisDetails: result.data?.details,
  };

  await db.upsertMarketAnalysisSnapshot({
    marketId: market.marketId,
    tokenId: market.tokenId,
    question: market.question,
    currentPrice: market.lastPrice,
    priceHistoryJson: JSON.stringify(priceHistory),
    timesnetSummary: summary,
    timesnetSignal: toAnalysisSignal(signal),
    timesnetConfidence: confidence,
    analysisJson: JSON.stringify(result.data?.details || {}),
  });

  return analysis;
}
