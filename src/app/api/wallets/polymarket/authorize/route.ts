import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSessionUser } from "@/backend/server/auth/session";
import { authorizeWalletPolymarketCredentials } from "@/backend/services/polymarket/auth";

const requestSchema = z.object({
  walletConnectionId: z.string().min(1),
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
});

export async function POST(request: NextRequest) {
  try {
    await requireSessionUser();
    const body = requestSchema.parse(await request.json());
    const result = await authorizeWalletPolymarketCredentials({
      walletConnectionId: body.walletConnectionId,
      signature: body.signature as `0x${string}`,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to authorize Polymarket wallet" },
      { status: 400 }
    );
  }
}
