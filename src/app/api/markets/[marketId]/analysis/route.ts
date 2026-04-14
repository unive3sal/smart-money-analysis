import { NextRequest, NextResponse } from "next/server";
import { getMarketAnalysis } from "@/services/analysis/marketAnalysis";

export async function GET(
  _request: NextRequest,
  { params }: { params: { marketId: string } }
) {
  try {
    const analysis = await getMarketAnalysis(params.marketId);
    return NextResponse.json({ success: true, data: analysis });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to load market analysis" },
      { status: 404 }
    );
  }
}
