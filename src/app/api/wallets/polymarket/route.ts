import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSessionUser } from "@/backend/server/auth/session";
import { getWalletPolymarketAuthStatus, requestWalletPolymarketReauth } from "@/backend/services/polymarket/auth";

const requestSchema = z.object({
  walletConnectionId: z.string().min(1),
});

export async function GET(request: NextRequest) {
  try {
    await requireSessionUser();
    const walletConnectionId = request.nextUrl.searchParams.get("walletConnectionId");

    if (!walletConnectionId) {
      return NextResponse.json({ success: false, error: "walletConnectionId is required" }, { status: 400 });
    }

    const status = await getWalletPolymarketAuthStatus(walletConnectionId);
    return NextResponse.json({ success: true, data: status });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to load Polymarket auth status" },
      { status: 400 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireSessionUser();
    const body = requestSchema.parse(await request.json());
    const payload = await requestWalletPolymarketReauth(body.walletConnectionId);
    return NextResponse.json({ success: true, data: payload });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to request Polymarket auth" },
      { status: 400 }
    );
  }
}
