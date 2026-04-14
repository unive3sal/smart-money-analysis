import { NextRequest, NextResponse } from "next/server";
import { getMediaSentiment } from "@/services/media/sentiment";
import { calculateConfidence, generateConfidenceSummary } from "@/services/confidence/calculator";
import { ConfidenceInput } from "@/services/confidence/types";
import { getMarketDataClient } from "@/services/marketData";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tokenSymbol = searchParams.get("tokenSymbol");

    if (!tokenSymbol) {
      return NextResponse.json(
        { success: false, error: "tokenSymbol is required" },
        { status: 400 }
      );
    }

    const marketData = getMarketDataClient();

    const [tokenInfo, sentiment] = await Promise.all([
      marketData.getTokenInfo(tokenSymbol).catch(() => null),
      getMediaSentiment(tokenSymbol),
    ]);

    const confidenceInput: ConfidenceInput = {
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
        volume24h: tokenInfo?.volume24h || 0,
        liquidity: 0,
        ageHours: 168,
        holderCount: 0,
      },
    };

    const confidence = calculateConfidence(confidenceInput);
    const summary = generateConfidenceSummary(confidence);

    return NextResponse.json({
      success: true,
      data: {
        token: {
          symbol: tokenInfo?.symbol || tokenSymbol,
          base: tokenInfo?.base,
          quote: tokenInfo?.quote,
          price: tokenInfo?.price,
          exchangeId: tokenInfo?.exchangeId,
        },
        confidence: {
          score: confidence.score,
          signal: confidence.signal,
          reliability: confidence.reliability,
          components: confidence.components,
          reasoning: confidence.reasoning,
          warnings: confidence.warnings,
        },
        summary,
        calculatedAt: confidence.calculatedAt,
      },
    });
  } catch (error) {
    console.error("Confidence API error:", error);

    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
