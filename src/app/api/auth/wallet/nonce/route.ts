import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { WalletChain, WalletProvider } from "@/server/db/client";
import { createWalletAuthNonce } from "@/server/auth/walletAuth";

const requestSchema = z.object({
  address: z.string().min(4),
  chain: z.nativeEnum(WalletChain),
  provider: z.nativeEnum(WalletProvider),
});

export async function POST(request: NextRequest) {
  try {
    const body = requestSchema.parse(await request.json());
    const nonce = createWalletAuthNonce(body.address);

    return NextResponse.json({
      success: true,
      data: {
        address: body.address,
        chain: body.chain,
        provider: body.provider,
        ...nonce,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Invalid wallet auth request",
      },
      { status: 400 }
    );
  }
}
