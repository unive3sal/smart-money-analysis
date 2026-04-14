import { AnalysisSignal, ExecutionStatus, PositionSide, TaskStatus, WalletChain, db } from "@/server/db/client";
import { getMarketAnalysis } from "@/services/analysis/marketAnalysis";
import { getPolymarketMarket } from "@/services/polymarket/markets";
import { getTraderActivity, getTopPolymarketTraders } from "@/services/polymarket/traders";
import type { CopyTradeTaskView } from "@/services/polymarket/types";

export interface CreateCopyTradeTaskInput {
  userId: string;
  walletConnectionId?: string;
  tradingVaultId?: string;
  traderAddress: string;
  traderChain?: WalletChain;
  name: string;
  allocationUsd: number;
  takeProfitPercent?: number;
  stopLossPercent?: number;
  maxSlippageBps?: number;
  timesnetEnabled?: boolean;
  timesnetMinimumConfidence?: number;
  timesnetRequiredSignal?: AnalysisSignal;
  notes?: string;
}

function toTaskView(task: {
  id: string;
  name: string;
  traderAddress: string;
  status: TaskStatus;
  allocationUsd: number;
  takeProfitPercent: number | null;
  stopLossPercent: number | null;
  timesnetEnabled: boolean;
  timesnetMinimumConfidence: number;
  timesnetRequiredSignal: AnalysisSignal | null;
  maxSlippageBps: number;
  lastAutoStopReason: string | null;
  updatedAt: string;
  positions: Array<{ realizedPnl: number; unrealizedPnl: number; status: string }>;
}): CopyTradeTaskView {
  const realizedPnl = task.positions.reduce((sum, position) => sum + position.realizedPnl, 0);
  const unrealizedPnl = task.positions.reduce((sum, position) => sum + position.unrealizedPnl, 0);
  const totalPositions = task.positions.length;
  const profitablePositions = task.positions.filter((position) => position.realizedPnl + position.unrealizedPnl > 0).length;

  return {
    id: task.id,
    name: task.name,
    traderAddress: task.traderAddress,
    status: task.status.toLowerCase(),
    allocationUsd: task.allocationUsd,
    takeProfitPercent: task.takeProfitPercent,
    stopLossPercent: task.stopLossPercent,
    timesnetEnabled: task.timesnetEnabled,
    timesnetMinimumConfidence: task.timesnetMinimumConfidence,
    timesnetRequiredSignal: task.timesnetRequiredSignal?.toLowerCase() || null,
    maxSlippageBps: task.maxSlippageBps,
    realizedPnl,
    unrealizedPnl,
    winRate: totalPositions === 0 ? 0 : profitablePositions / totalPositions * 100,
    totalPositions,
    openPositions: task.positions.filter((position) => position.status === "open").length,
    lastAutoStopReason: task.lastAutoStopReason,
    updatedAt: task.updatedAt,
  };
}

export async function listCopyTradeTasks(userId: string) {
  const tasks = await db.listCopyTradeTasks(userId);

  return tasks.map(toTaskView);
}

export async function getCopyTradeTask(taskId: string, userId: string) {
  const task = await db.findCopyTradeTask(taskId, userId);

  if (!task) {
    throw new Error("Copy trade task not found");
  }

  return {
    ...toTaskView(task),
    executions: task.executions,
    walletConnection: task.walletConnection,
    tradingVault: task.tradingVault,
  };
}

export async function createCopyTradeTask(input: CreateCopyTradeTaskInput) {
  const topTraders = await getTopPolymarketTraders(25);
  const trader = topTraders.find((item) => item.address.toLowerCase() === input.traderAddress.toLowerCase());
  const activities = await getTraderActivity(input.traderAddress);
  const latestActivity = activities[0];
  const bootstrappedCursor = latestActivity?.id || null;

  const task = await db.createCopyTradeTask({
    userId: input.userId,
    walletConnectionId: input.walletConnectionId || null,
    tradingVaultId: input.tradingVaultId || null,
    traderAddress: input.traderAddress,
    traderChain: input.traderChain || WalletChain.EVM,
    status: TaskStatus.ACTIVE,
    name: input.name,
    allocationUsd: input.allocationUsd,
    maxSlippageBps: input.maxSlippageBps ?? 150,
    takeProfitPercent: input.takeProfitPercent ?? null,
    stopLossPercent: input.stopLossPercent ?? null,
    autoStopAfterTakeProfit: true,
    autoStopAfterStopLoss: true,
    timesnetEnabled: input.timesnetEnabled ?? true,
    timesnetMinimumConfidence: input.timesnetMinimumConfidence ?? 0.55,
    timesnetRequiredSignal: input.timesnetRequiredSignal ?? AnalysisSignal.BUY,
    notes: input.notes || null,
    lastProcessedCursor: bootstrappedCursor,
    lastAutoStopReason: null,
  });

  if (latestActivity) {
    const market = await getPolymarketMarket(latestActivity.marketId).catch(() => null);
    if (market) {
      await db.createCopyTradePosition({
        taskId: task.id,
        marketId: market.marketId,
        tokenId: market.tokenId,
        side: latestActivity.side === "BUY" ? PositionSide.BUY : PositionSide.SELL,
        shares: Math.max(1, Math.round(input.allocationUsd / Math.max(latestActivity.price, 0.01))),
        averageEntryPrice: latestActivity.price,
        currentPrice: latestActivity.price,
        realizedPnl: 0,
        unrealizedPnl: trader ? trader.unrealizedPnl / Math.max(trader.totalTrades, 1) : 12.5,
        status: "open",
      });

      await db.createCopyTradeExecution({
        taskId: task.id,
        marketId: market.marketId,
        tokenId: market.tokenId,
        traderActivityEventId: null,
        side: latestActivity.side === "BUY" ? PositionSide.BUY : PositionSide.SELL,
        status: ExecutionStatus.SUBMITTED,
        orderType: "GTC",
        price: latestActivity.price,
        size: latestActivity.size,
        executedPrice: latestActivity.price,
        transactionHash: null,
        rejectionReason: null,
        metadataJson: JSON.stringify({ source: "bootstrap", traderActivity: latestActivity }),
      });
    }
  }

  return getCopyTradeTask(task.id, input.userId);
}

export async function updateCopyTradeTaskStatus(taskId: string, userId: string, status: TaskStatus, reason?: string) {
  await db.updateCopyTradeTask(taskId, {
    status,
    lastAutoStopReason: reason || null,
  });

  return getCopyTradeTask(taskId, userId);
}

export async function deleteCopyTradeTask(taskId: string, userId: string) {
  await db.deleteCopyTradeTask(taskId, userId);

  return { deleted: true };
}

export async function getCopyTradeTaskPerformance(taskId: string, userId: string) {
  const task = await db.findCopyTradeTask(taskId, userId);

  if (!task) {
    throw new Error("Copy trade task not found");
  }

  const taskView = toTaskView(task);
  const marketIds = [...new Set(task.positions.map((position) => position.marketId))];
  const analyses = await Promise.all(marketIds.map((marketId) => getMarketAnalysis(marketId).catch(() => null)));

  return {
    ...taskView,
    analyses: analyses.filter(Boolean),
  };
}
