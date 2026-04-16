import { NextRequest, NextResponse } from "next/server";
import { listPolymarketMarkets } from "@/backend/services/polymarket/markets";

export async function GET(_request: NextRequest) {
  const markets = await listPolymarketMarkets();

  return NextResponse.json({
    success: true,
    data: markets,
  });
}
