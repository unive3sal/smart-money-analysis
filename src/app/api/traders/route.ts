import { NextRequest, NextResponse } from "next/server";
import { getTopPolymarketTraders } from "@/services/polymarket/traders";

export async function GET(request: NextRequest) {
  const limit = Number(request.nextUrl.searchParams.get("limit") || 10);
  const traders = await getTopPolymarketTraders(limit);

  return NextResponse.json({
    success: true,
    data: traders,
  });
}
