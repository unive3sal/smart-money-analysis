import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { WalletChain, WalletProvider } from "@/server/db/client";
import { createWalletSession } from "@/server/auth/session";
import { clearWalletAuthNonce, verifyWalletSignature } from "@/server/auth/walletAuth";

const requestSchema = z.object({
  address: z.string().min(4),
  provider: z.nativeEnum(WalletProvider),
  chain: z.nativeEnum(WalletChain),
  message: z.string().min(10),
  signature: z.string().min(10),
  label: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = requestSchema.parse(await request.json());
    const verified = await verifyWalletSignature(body);

    if (!verified) {
      return NextResponse.json(
        { success: false, error: "Wallet signature verification failed" },
        { status: 401 }
      );
    }

    const user = await createWalletSession({
      address: body.address,
      chain: body.chain,
      provider: body.provider,
      label: body.label,
    });

    clearWalletAuthNonce();

    return NextResponse.json({
      success: true,
      data: {
        userId: user.id,
        primaryAddress: user.primaryAddress,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Wallet verification failed",
      },
      { status: 400 }
    );
  }
}
