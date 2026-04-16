import { db } from "@/backend/server/db/client";

export async function seedLeaderboardSnapshot() {
  const count = await db.countLeaderboardSnapshots();

  if (count > 0) {
    return;
  }

  await db.createLeaderboardSnapshots([
      {
        address: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063",
        displayName: "Election Whale",
        rank: 1,
        realizedPnl: 184320,
        unrealizedPnl: 12540,
        winRate: 71.4,
        totalTrades: 148,
        activityScore: 92,
      },
      {
        address: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
        displayName: "Macro Oracle",
        rank: 2,
        realizedPnl: 131940,
        unrealizedPnl: 8640,
        winRate: 67.9,
        totalTrades: 101,
        activityScore: 88,
      },
      {
        address: "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E",
        displayName: "News Catalyst",
        rank: 3,
        realizedPnl: 97210,
        unrealizedPnl: 5220,
        winRate: 63.2,
        totalTrades: 87,
        activityScore: 81,
      },
  ]);
}
