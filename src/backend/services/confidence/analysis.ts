import { getMediaSentiment } from "@/backend/services/media/sentiment";
import { getMarketDataClient } from "@/backend/services/marketData";
import {
  calculateConfidence,
  generateConfidenceSummary,
} from "@/backend/services/confidence/calculator";
import { ConfidenceInput, ConfidenceScore } from "@/backend/services/confidence/types";
import type { TraceContext } from "@/backend/observability";

export interface TokenConfidenceAnalysis {
  token: {
    symbol: string;
    base?: string;
    quote?: string;
    price?: number;
    exchangeId?: string;
  };
  confidence: ConfidenceScore;
  summary: string;
  calculatedAt: number;
}

function buildConfidenceInput(
  volume24h: number,
  sentiment: Awaited<ReturnType<typeof getMediaSentiment>>
): ConfidenceInput {
  return {
    marketActivity: {
      netFlow24h: 0,
      uniqueBuyers: 0,
      uniqueSellers: 0,
      dominantSide: "hold",
      avgWinRate: 0,
      recentPnl: 0,
    },
    media: {
      sentimentScore: sentiment.sentimentScore,
      mentions24h: sentiment.mentions24h,
      trendingRank: sentiment.trendingRank,
    },
    token: {
      marketCap: 0,
      volume24h,
      liquidity: 0,
      ageHours: 168,
      holderCount: 0,
    },
  };
}

export async function getTokenConfidenceAnalysis(
  tokenSymbol: string,
  context?: TraceContext
): Promise<TokenConfidenceAnalysis> {
  const marketData = getMarketDataClient();
  const [tokenInfo, sentiment] = await Promise.all([
    marketData.getTokenInfo(tokenSymbol, context).catch(() => null),
    getMediaSentiment(tokenSymbol),
  ]);

  const confidence = calculateConfidence(
    buildConfidenceInput(tokenInfo?.volume24h || 0, sentiment)
  );

  return {
    token: {
      symbol: tokenInfo?.symbol || tokenSymbol,
      base: tokenInfo?.base,
      quote: tokenInfo?.quote,
      price: tokenInfo?.price,
      exchangeId: tokenInfo?.exchangeId,
    },
    confidence,
    summary: generateConfidenceSummary(confidence),
    calculatedAt: confidence.calculatedAt,
  };
}
