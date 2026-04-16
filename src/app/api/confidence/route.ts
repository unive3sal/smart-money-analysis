import { NextRequest, NextResponse } from "next/server";
import { getTokenConfidenceAnalysis } from "@/backend/services/confidence/analysis";

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

    const analysis = await getTokenConfidenceAnalysis(tokenSymbol);

    return NextResponse.json({
      success: true,
      data: {
        token: analysis.token,
        confidence: {
          score: analysis.confidence.score,
          signal: analysis.confidence.signal,
          reliability: analysis.confidence.reliability,
          components: analysis.confidence.components,
          reasoning: analysis.confidence.reasoning,
          warnings: analysis.confidence.warnings,
        },
        summary: analysis.summary,
        calculatedAt: analysis.calculatedAt,
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
