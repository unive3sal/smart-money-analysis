import { db } from "@/server/db/client";
import { getFallbackPolymarketMarkets } from "@/services/polymarket/markets";
import { getPolymarketService } from "@/services/polymarket/client";
import type { PolymarketTrader } from "@/services/polymarket/types";

export async function getTopPolymarketTraders(limit = 10): Promise<PolymarketTrader[]> {
  const snapshots = await db.listLeaderboardSnapshots(limit);

  if (snapshots.length > 0) {
    return snapshots.map((snapshot) => ({
      address: snapshot.address,
      displayName: snapshot.displayName || `${snapshot.address.slice(0, 6)}...${snapshot.address.slice(-4)}`,
      realizedPnl: snapshot.realizedPnl,
      unrealizedPnl: snapshot.unrealizedPnl,
      winRate: snapshot.winRate,
      totalTrades: snapshot.totalTrades,
      activityScore: snapshot.activityScore,
      copiedByTasks: 0,
    }));
  }

  const seeded = [
    {
      address: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063",
      displayName: "Election Whale",
      realizedPnl: 184320,
      unrealizedPnl: 12540,
      winRate: 71.4,
      totalTrades: 148,
      activityScore: 92,
      copiedByTasks: 18,
    },
    {
      address: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
      displayName: "Macro Oracle",
      realizedPnl: 131940,
      unrealizedPnl: 8640,
      winRate: 67.9,
      totalTrades: 101,
      activityScore: 88,
      copiedByTasks: 11,
    },
    {
      address: "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E",
      displayName: "News Catalyst",
      realizedPnl: 97210,
      unrealizedPnl: 5220,
      winRate: 63.2,
      totalTrades: 87,
      activityScore: 81,
      copiedByTasks: 7,
    },
  ] satisfies PolymarketTrader[];

  return seeded.slice(0, limit);
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
