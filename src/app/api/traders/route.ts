import { NextRequest, NextResponse } from "next/server";
import { getBirdeyeClient } from "@/services/birdeye/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Valid Birdeye time_frame values for top_traders endpoint
type ValidTimeframe = "30m" | "1h" | "2h" | "4h" | "6h" | "8h" | "12h" | "24h";
const VALID_TIMEFRAMES: ValidTimeframe[] = ["30m", "1h", "2h", "4h", "6h", "8h", "12h", "24h"];

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedTimeframe = searchParams.get("timeframe") || "24h";
    // Validate timeframe - default to 24h if invalid
    const timeframe: ValidTimeframe = VALID_TIMEFRAMES.includes(requestedTimeframe as ValidTimeframe)
      ? (requestedTimeframe as ValidTimeframe)
      : "24h";
    // Birdeye API limit is 1-10 for top_traders endpoint
    const limit = Math.min(parseInt(searchParams.get("limit") || "10"), 10);
    // Default to wrapped SOL if no token specified
    const tokenAddress = searchParams.get("token") || "So11111111111111111111111111111111111111112";

    const birdeye = getBirdeyeClient();
    const traders = await birdeye.getTopTraders(tokenAddress, timeframe, limit);

    return NextResponse.json({
      success: true,
      data: {
        tokenAddress,
        timeframe,
        count: traders.length,
        traders: traders.map((t) => ({
          owner: t.owner,
          volume: t.volume,
          trade: t.trade,
          tradeBuy: t.tradeBuy,
          tradeSell: t.tradeSell,
          volumeBuy: t.volumeBuy,
          volumeSell: t.volumeSell,
          tags: t.tags,
        })),
      },
    });
  } catch (error) {
    console.error("Traders API error:", error);

    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
