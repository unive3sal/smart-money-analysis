import { NextRequest, NextResponse } from "next/server";
import { extractWalletFeatures, generateFeatureSummary } from "@/services/features/extractor";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  try {
    const { address } = await params;

    if (!address) {
      return NextResponse.json(
        { success: false, error: "Wallet address is required" },
        { status: 400 }
      );
    }

    const features = await extractWalletFeatures(address);
    const summary = generateFeatureSummary(features);

    return NextResponse.json({
      success: true,
      data: {
        address,
        summary,
        features: {
          trading: features.trading,
          performance: features.performance,
          preferences: features.preferences,
          risk: features.risk,
          recentActivity: features.recentActivity,
        },
        timestamp: features.snapshotTimestamp,
      },
    });
  } catch (error) {
    console.error("Wallet API error:", error);

    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
