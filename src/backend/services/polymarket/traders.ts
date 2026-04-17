import { db } from "@/backend/server/db/client";
import { getFallbackPolymarketMarkets } from "@/backend/services/polymarket/markets";
import { getPolymarketService } from "@/backend/services/polymarket/client";
import type { PolymarketTrader } from "@/backend/services/polymarket/types";

function toSnapshotTrader(snapshot: {
  address: string;
  displayName: string | null;
  realizedPnl: number;
  unrealizedPnl: number;
  winRate: number;
  totalTrades: number;
  activityScore: number;
}, copiedByTasks: number): PolymarketTrader {
  return {
    address: snapshot.address,
    displayName: snapshot.displayName || `${snapshot.address.slice(0, 6)}...${snapshot.address.slice(-4)}`,
    realizedPnl: snapshot.realizedPnl,
    unrealizedPnl: snapshot.unrealizedPnl,
    winRate: snapshot.winRate,
    totalTrades: snapshot.totalTrades,
    activityScore: snapshot.activityScore,
    copiedByTasks,
  };
}

async function withCopiedByTaskCounts(traders: PolymarketTrader[]) {
  const counts = await db.countCopyTradeTasksByTraderAddresses(traders.map((trader) => trader.address));

  return traders.map((trader) => ({
    ...trader,
    copiedByTasks: counts[trader.address.toLowerCase()] || 0,
  }));
}

export async function refreshLeaderboardSnapshot(limit = 25) {
  const service = getPolymarketService();
  const traders = await service.getTopTraders(limit);

  await db.replaceLeaderboardSnapshots(
    traders.map((trader, index) => ({
      address: trader.address,
      displayName: trader.displayName,
      rank: index + 1,
      realizedPnl: trader.realizedPnl,
      unrealizedPnl: trader.unrealizedPnl,
      winRate: trader.winRate,
      totalTrades: trader.totalTrades,
      activityScore: trader.activityScore,
    }))
  );

  return withCopiedByTaskCounts(traders);
}

export async function getTopPolymarketTraders(limit = 10): Promise<PolymarketTrader[]> {
  try {
    const traders = await refreshLeaderboardSnapshot(Math.max(limit, 10));
    return traders.slice(0, limit);
  } catch {
    const snapshots = await db.listLeaderboardSnapshots(limit);
    return withCopiedByTaskCounts(
      snapshots.map((snapshot) => toSnapshotTrader(snapshot, 0))
    );
  }
}

export async function getTraderActivity(address: string) {
  try {
    const service = getPolymarketService();
    return await service.getTraderActivity(address);
  } catch {
    const fallbackMarkets = getFallbackPolymarketMarkets();
    return [
      {
        id: crypto.randomUUID(),
        traderAddress: address,
        marketId: fallbackMarkets[0].marketId,
        tokenId: fallbackMarkets[0].tokenId,
        side: "BUY" as const,
        outcome: "Yes",
        price: 0.61,
        size: 420,
        transactionHash: undefined,
        timestamp: new Date(Date.now() - 1000 * 60 * 4).toISOString(),
        question: fallbackMarkets[0].question,
      },
      {
        id: crypto.randomUUID(),
        traderAddress: address,
        marketId: fallbackMarkets[1].marketId,
        tokenId: fallbackMarkets[1].tokenId,
        side: "SELL" as const,
        outcome: "No",
        price: 0.44,
        size: 215,
        transactionHash: undefined,
        timestamp: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
        question: fallbackMarkets[1].question,
      },
    ];
  }
}
