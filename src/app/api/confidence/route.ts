import { NextRequest, NextResponse } from "next/server";
import { getBirdeyeClient } from "@/services/birdeye/client";
import { getMediaSentiment } from "@/services/media/sentiment";
import { calculateConfidence, generateConfidenceSummary } from "@/services/confidence/calculator";
import { ConfidenceInput } from "@/services/confidence/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tokenAddress = searchParams.get("tokenAddress");
    const tokenSymbol = searchParams.get("tokenSymbol") || "UNKNOWN";

    if (!tokenAddress) {
      return NextResponse.json(
        { success: false, error: "tokenAddress is required" },
        { status: 400 }
      );
    }

    const birdeye = getBirdeyeClient();

    // Fetch data in parallel
    const [tokenInfo, sentiment] = await Promise.all([
      birdeye.getTokenInfo(tokenAddress).catch(() => null),
      getMediaSentiment(tokenSymbol, tokenAddress),
    ]);

    // Build confidence input
    const confidenceInput: ConfidenceInput = {
      smartMoney: {
        // In production, aggregate from actual smart money tracking
        netFlow24h: 10000,
        uniqueBuyers: 5,
        uniqueSellers: 2,
        topWalletAction: "buy",
        avgWinRate: 0.55,
        recentPnl: 5000,
      },
      media: {
        sentimentScore: sentiment.sentimentScore,
        mentions24h: sentiment.mentions24h,
        trendingRank: sentiment.trendingRank,
      },
      token: {
        marketCap: tokenInfo?.marketCap || 0,
        volume24h: tokenInfo?.v24hUSD || 0,
        liquidity: tokenInfo?.liquidity || 0,
        ageHours: 168,
        holderCount: tokenInfo?.holder || 0,
      },
    };

    const confidence = calculateConfidence(confidenceInput);
    const summary = generateConfidenceSummary(confidence);

    return NextResponse.json({
      success: true,
      data: {
        token: {
          address: tokenAddress,
          symbol: tokenSymbol,
          name: tokenInfo?.name,
          price: tokenInfo?.price,
          marketCap: tokenInfo?.marketCap,
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
