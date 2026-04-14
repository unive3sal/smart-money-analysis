import { NextResponse } from "next/server";
import { db } from "@/server/db/client";
import { requireSessionUser } from "@/server/auth/session";

export async function GET() {
  try {
    const user = await requireSessionUser();
    const wallets = await db.listWalletConnections(user.id);
    const vaults = await db.listTradingVaults(user.id);

    return NextResponse.json({
      success: true,
      data: {
        user,
        wallets,
        vaults,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to load wallets",
      },
      { status: 401 }
    );
  }
}
