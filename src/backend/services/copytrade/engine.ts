import { AnalysisSignal, ExecutionStatus, PositionSide, TaskStatus, db } from "@/backend/server/db/client";
import { getMarketAnalysis } from "@/backend/services/analysis/marketAnalysis";
import { getPolymarketMarket } from "@/backend/services/polymarket/markets";
import { getTaskExecutionAuthorization } from "@/backend/services/polymarket/auth";
import { getTraderActivity } from "@/backend/services/polymarket/traders";

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

    const executionAuthorization = await getTaskExecutionAuthorization(task);
    if (!executionAuthorization.canExecute) {
      await db.updateCopyTradeTask(task.id, {
        lastAutoStopReason: executionAuthorization.reason || "wallet_authorization_required",
      });
      results.push({ taskId: task.id, action: "blocked", reason: executionAuthorization.reason || "wallet_authorization_required" });
      continue;
    }

    const realizedPnl = Math.max(-task.allocationUsd * 0.04, (analysis.currentPrice - 0.5) * task.allocationUsd);

    if (task.stopLossPercent && realizedPnl <= -Math.abs(task.stopLossPercent) / 100 * task.allocationUsd) {
      await db.cancelPendingExecutionsForTask(task.id, "stop_loss");
      await db.updateCopyTradeTask(task.id, {
        status: task.autoStopAfterStopLoss ? TaskStatus.STOPPED : TaskStatus.PAUSED,
        lastAutoStopReason: `Stop-loss triggered at ${task.stopLossPercent}%`,
        lastProcessedCursor: latest.id,
      });
      results.push({ taskId: task.id, action: "auto_stop", reason: "stop_loss" });
      continue;
    }

    if (task.takeProfitPercent && realizedPnl >= Math.abs(task.takeProfitPercent) / 100 * task.allocationUsd) {
      await db.cancelPendingExecutionsForTask(task.id, "take_profit");
      await db.updateCopyTradeTask(task.id, {
        status: task.autoStopAfterTakeProfit ? TaskStatus.STOPPED : TaskStatus.PAUSED,
        lastAutoStopReason: `Take-profit triggered at ${task.takeProfitPercent}%`,
        lastProcessedCursor: latest.id,
      });
      results.push({ taskId: task.id, action: "auto_stop", reason: "take_profit" });
      continue;
    }

    const existingExecution = await db.findCopyTradeExecutionByTaskAndActivity(task.id, latest.id);
    if (existingExecution) {
      await db.updateCopyTradeTask(task.id, {
        lastProcessedCursor: latest.id,
        lastAutoStopReason: null,
      });
      results.push({ taskId: task.id, action: "already_queued", reason: existingExecution.status.toLowerCase() });
      continue;
    }

    const market = await getPolymarketMarket(latest.marketId).catch(() => null);
    const walletAddress = task.walletConnection?.address || task.tradingVault?.funderAddress || "";
    const funderAddress = task.tradingVault?.funderAddress || null;
    const preparePayload = {
      executionId: `${task.id}:${latest.id}`,
      taskId: task.id,
      marketId: latest.marketId,
      tokenId: latest.tokenId,
      side: latest.side,
      price: latest.price,
      size: latest.size,
      orderType: "GTC",
      walletAddress,
      funderAddress,
      expiresAt: null,
      metadata: {
        copiedTraderAddress: latest.traderAddress,
        copiedTraderTimestamp: latest.timestamp,
        analysisSignal: analysis.signal,
        analysisConfidence: analysis.confidence,
        question: market?.question || latest.question,
        tickSize: market?.tickSize || null,
        negRisk: market?.negRisk ?? false,
        maxSlippageBps: task.maxSlippageBps,
      },
    };

    await db.createCopyTradeExecution({
      taskId: task.id,
      marketId: latest.marketId,
      tokenId: latest.tokenId,
      traderActivityEventId: latest.id,
      side: latest.side === "BUY" ? PositionSide.BUY : PositionSide.SELL,
      status: ExecutionStatus.PENDING,
      orderType: "GTC",
      price: latest.price,
      size: latest.size,
      executedPrice: null,
      transactionHash: null,
      rejectionReason: null,
      metadataJson: JSON.stringify({
        source: "worker_queue",
        traderActivity: latest,
        analysis,
        preparePayload,
      }),
    });

    await db.updateCopyTradeTask(task.id, {
      lastProcessedCursor: latest.id,
      lastAutoStopReason: null,
    });

    results.push({ taskId: task.id, action: "queued" });
  }

  return results;
}
