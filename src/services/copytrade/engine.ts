import { AnalysisSignal, TaskStatus, db } from "@/server/db/client";
import { getMarketAnalysis } from "@/services/analysis/marketAnalysis";
import { getTraderActivity } from "@/services/polymarket/traders";

function signalMeetsRequirement(signal: string, required: AnalysisSignal | null) {
  const ranking = {
    strong_buy: 5,
    buy: 4,
    hold: 3,
    sell: 2,
    strong_sell: 1,
    avoid: 0,
  } as const;

  const normalizedRequired = (required || AnalysisSignal.BUY).toLowerCase() as keyof typeof ranking;
  const normalizedSignal = (signal || "hold").toLowerCase() as keyof typeof ranking;

  return ranking[normalizedSignal] >= ranking[normalizedRequired];
}

export async function runCopytradeWorkerCycle() {
  const activeTasks = await db.listActiveCopyTradeTasks();

  const results = [] as Array<{ taskId: string; action: string; reason?: string }>;

  for (const task of activeTasks) {
    const activity = await getTraderActivity(task.traderAddress);
    const latest = activity[0];

    if (!latest) {
      results.push({ taskId: task.id, action: "skip", reason: "no_activity" });
      continue;
    }

    const analysis = await getMarketAnalysis(latest.marketId).catch(() => null);

    if (!analysis) {
      results.push({ taskId: task.id, action: "skip", reason: "analysis_unavailable" });
      continue;
    }

    if (task.lastProcessedCursor === latest.id) {
      results.push({ taskId: task.id, action: "skip", reason: "already_processed" });
      continue;
    }

    if (
      task.timesnetEnabled &&
      (!signalMeetsRequirement(analysis.signal, task.timesnetRequiredSignal) ||
        analysis.confidence < task.timesnetMinimumConfidence)
    ) {
      results.push({ taskId: task.id, action: "blocked", reason: "timesnet_filter" });
      continue;
    }

    const realizedPnl = Math.max(-task.allocationUsd * 0.04, (analysis.currentPrice - 0.5) * task.allocationUsd);

    if (task.stopLossPercent && realizedPnl <= -Math.abs(task.stopLossPercent) / 100 * task.allocationUsd) {
      await db.updateCopyTradeTask(task.id, {
        status: task.autoStopAfterStopLoss ? TaskStatus.STOPPED : TaskStatus.PAUSED,
        lastAutoStopReason: `Stop-loss triggered at ${task.stopLossPercent}%`,
        lastProcessedCursor: latest.id,
      });
      results.push({ taskId: task.id, action: "auto_stop", reason: "stop_loss" });
      continue;
    }

    if (task.takeProfitPercent && realizedPnl >= Math.abs(task.takeProfitPercent) / 100 * task.allocationUsd) {
      await db.updateCopyTradeTask(task.id, {
        status: task.autoStopAfterTakeProfit ? TaskStatus.STOPPED : TaskStatus.PAUSED,
        lastAutoStopReason: `Take-profit triggered at ${task.takeProfitPercent}%`,
        lastProcessedCursor: latest.id,
      });
      results.push({ taskId: task.id, action: "auto_stop", reason: "take_profit" });
      continue;
    }

    await db.updateCopyTradeTask(task.id, {
      lastProcessedCursor: latest.id,
      lastAutoStopReason: null,
    });

    results.push({ taskId: task.id, action: "eligible" });
  }

  return results;
}
