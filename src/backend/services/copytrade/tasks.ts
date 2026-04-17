import { AnalysisSignal, ExecutionStatus, PositionSide, TaskStatus, WalletChain, db } from "@/backend/server/db/client";
import { getMarketAnalysis } from "@/backend/services/analysis/marketAnalysis";
import { listBrokeredExecutions } from "@/backend/services/copytrade/executions";
import { getTaskExecutionAuthorization } from "@/backend/services/polymarket/auth";
import { getPolymarketMarket } from "@/backend/services/polymarket/markets";
import { getTraderActivity, getTopPolymarketTraders } from "@/backend/services/polymarket/traders";
import type { CopyTradeTaskView } from "@/backend/services/polymarket/types";

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

const DEFAULT_COPY_TRADE_SETTINGS = {
  status: TaskStatus.ACTIVE,
  traderChain: WalletChain.EVM,
  maxSlippageBps: 150,
  autoStopAfterTakeProfit: true,
  autoStopAfterStopLoss: true,
  timesnetEnabled: true,
  timesnetMinimumConfidence: 0.55,
  timesnetRequiredSignal: AnalysisSignal.BUY,
} as const;

function summarizeTaskPositions(positions: Array<{ realizedPnl: number; unrealizedPnl: number; status: string }>) {
  const realizedPnl = positions.reduce((sum, position) => sum + position.realizedPnl, 0);
  const unrealizedPnl = positions.reduce((sum, position) => sum + position.unrealizedPnl, 0);
  const totalPositions = positions.length;
  const profitablePositions = positions.filter((position) => position.realizedPnl + position.unrealizedPnl > 0).length;

  return {
    realizedPnl,
    unrealizedPnl,
    totalPositions,
    profitablePositions,
    openPositions: positions.filter((position) => position.status === "open").length,
    winRate: totalPositions === 0 ? 0 : profitablePositions / totalPositions * 100,
  };
}

async function toTaskView(task: {
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
  walletConnectionId?: string | null;
  walletConnection?: { id: string; address: string; chain: WalletChain; provider: string; polymarketAuthState?: string | null; polymarketApiKeyEncrypted?: string | null; polymarketApiSecretEncrypted?: string | null; polymarketApiPassphraseEncrypted?: string | null; polymarketApiCredsExpiresAt?: string | null; polymarketApiCredsLastDerivedAt?: string | null; polymarketReauthMessage?: string | null; polymarketReauthRequestedAt?: string | null } | null;
  tradingVault?: { id: string | null } | null;
  positions: Array<{ realizedPnl: number; unrealizedPnl: number; status: string }>;
}): Promise<CopyTradeTaskView> {
  const positionSummary = summarizeTaskPositions(task.positions);
  const executionAuthorization = await getTaskExecutionAuthorization({
    walletConnectionId: task.walletConnectionId ?? null,
    walletConnection: task.walletConnection as never,
    tradingVault: task.tradingVault as never,
  });

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
    realizedPnl: positionSummary.realizedPnl,
    unrealizedPnl: positionSummary.unrealizedPnl,
    winRate: positionSummary.winRate,
    totalPositions: positionSummary.totalPositions,
    openPositions: positionSummary.openPositions,
    lastAutoStopReason: task.lastAutoStopReason,
    executionAuthorizationReason: executionAuthorization.reason,
    executionWalletState: executionAuthorization.walletStatus?.state || null,
    updatedAt: task.updatedAt,
  };
}

function buildCreateTaskDefaults(input: CreateCopyTradeTaskInput, bootstrappedCursor: string | null) {
  return {
    userId: input.userId,
    walletConnectionId: input.walletConnectionId || null,
    tradingVaultId: input.tradingVaultId || null,
    traderAddress: input.traderAddress,
    traderChain: input.traderChain || DEFAULT_COPY_TRADE_SETTINGS.traderChain,
    status: DEFAULT_COPY_TRADE_SETTINGS.status,
    name: input.name,
    allocationUsd: input.allocationUsd,
    maxSlippageBps: input.maxSlippageBps ?? DEFAULT_COPY_TRADE_SETTINGS.maxSlippageBps,
    takeProfitPercent: input.takeProfitPercent ?? null,
    stopLossPercent: input.stopLossPercent ?? null,
    autoStopAfterTakeProfit: DEFAULT_COPY_TRADE_SETTINGS.autoStopAfterTakeProfit,
    autoStopAfterStopLoss: DEFAULT_COPY_TRADE_SETTINGS.autoStopAfterStopLoss,
    timesnetEnabled: input.timesnetEnabled ?? DEFAULT_COPY_TRADE_SETTINGS.timesnetEnabled,
    timesnetMinimumConfidence:
      input.timesnetMinimumConfidence ?? DEFAULT_COPY_TRADE_SETTINGS.timesnetMinimumConfidence,
    timesnetRequiredSignal:
      input.timesnetRequiredSignal ?? DEFAULT_COPY_TRADE_SETTINGS.timesnetRequiredSignal,
    notes: input.notes || null,
    lastProcessedCursor: bootstrappedCursor,
    lastAutoStopReason: null,
  };
}

export async function listCopyTradeTasks(userId: string) {
  const tasks = await db.listCopyTradeTasks(userId);

  return Promise.all(tasks.map((task) => toTaskView(task)));
}

export async function getCopyTradeTask(taskId: string, userId: string) {
  const task = await db.findCopyTradeTask(taskId, userId);

  if (!task) {
    throw new Error("Copy trade task not found");
  }

  return {
    ...(await toTaskView(task)),
    executions: task.executions,
    pendingExecutions: (await listBrokeredExecutions(userId, ExecutionStatus.PENDING)).filter(
      (execution) => execution.taskId === task.id
    ),
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

  const task = await db.createCopyTradeTask(buildCreateTaskDefaults(input, bootstrappedCursor));

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
        traderActivityEventId: latestActivity.id,
        side: latestActivity.side === "BUY" ? PositionSide.BUY : PositionSide.SELL,
        status: ExecutionStatus.PENDING,
        orderType: "GTC",
        price: latestActivity.price,
        size: latestActivity.size,
        executedPrice: null,
        transactionHash: null,
        rejectionReason: null,
        metadataJson: JSON.stringify({
          source: "bootstrap",
          traderActivity: latestActivity,
          preparePayload: {
            executionId: "bootstrap",
            taskId: task.id,
            marketId: market.marketId,
            tokenId: market.tokenId,
            side: latestActivity.side,
            price: latestActivity.price,
            size: latestActivity.size,
            orderType: "GTC",
            walletAddress: task.walletConnectionId || "",
            funderAddress: task.tradingVaultId || null,
            expiresAt: null,
            metadata: {
              source: "bootstrap",
              question: market.question,
              tickSize: market.tickSize,
              negRisk: market.negRisk,
            },
          },
        }),
      });
    }
  }

  return getCopyTradeTask(task.id, input.userId);
}

export async function updateCopyTradeTaskStatus(taskId: string, userId: string, status: TaskStatus, reason?: string) {
  if (status === TaskStatus.STOPPED) {
    await db.cancelPendingExecutionsForTask(taskId, reason || "task_stopped");
  }

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
