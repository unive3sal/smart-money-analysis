import { NextRequest, NextResponse } from "next/server";
import { getBirdeyeClient } from "@/services/birdeye/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const timeframe = (searchParams.get("timeframe") as "24h" | "7d" | "30d") || "24h";
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);

    const birdeye = getBirdeyeClient();
    const traders = await birdeye.getTopTraders(timeframe, limit);

    return NextResponse.json({
      success: true,
      data: {
        timeframe,
        count: traders.length,
        traders: traders.map((t) => ({
          address: t.address,
          pnl: t.pnl,
          pnlPercent: t.pnlPercent,
          winRate: t.winRate,
          tradeCount: t.tradeCount,
          volume: t.volume,
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
