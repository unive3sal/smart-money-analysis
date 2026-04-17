import { NextResponse } from "next/server";
import { db } from "@/backend/server/db/client";
import { requireSessionUser } from "@/backend/server/auth/session";
import { getWalletPolymarketAuthStatus } from "@/backend/services/polymarket/auth";

export async function GET() {
  try {
    const user = await requireSessionUser();
    const wallets = await db.listWalletConnections(user.id);
    const vaults = await db.listTradingVaults(user.id);
    const walletStatuses = await Promise.all(
      wallets.map(async (wallet) => ({
        walletId: wallet.id,
        status: await getWalletPolymarketAuthStatus(wallet.id),
      }))
    );
    const statusMap = new Map(walletStatuses.map((entry) => [entry.walletId, entry.status]));

    return NextResponse.json({
      success: true,
      data: {
        user,
        wallets: wallets.map((wallet) => ({
          ...wallet,
          polymarketAuth: statusMap.get(wallet.id) || null,
        })),
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
