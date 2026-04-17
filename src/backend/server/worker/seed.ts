import { logError, logInfo } from "@/backend/observability";
import { refreshLeaderboardSnapshot } from "@/backend/services/polymarket/traders";

export async function refreshWorkerLeaderboardSnapshot() {
  try {
    const traders = await refreshLeaderboardSnapshot(25);
    logInfo("Leaderboard snapshot refreshed", {
      operation: "leaderboard_snapshot_refresh",
      outcome: "success",
      leaderboard_count: traders.length,
    });
    return traders;
  } catch (error) {
    logError("Leaderboard snapshot refresh failed", error, {
      operation: "leaderboard_snapshot_refresh",
      outcome: "error",
    });
    return [];
  }
}
