import { getMediaSentiment } from "@/backend/services/media/sentiment";
import { type TraceContext, logError } from "@/backend/observability";
import { queryTimesNet } from "@/backend/services/timesnet/client";
import { getMarketDataClient } from "@/backend/services/marketData";
import { getSessionUser } from "@/backend/server/auth/session";
import { requireActorUser, type ActorContext } from "@/backend/server/auth/actor";
import { db, AnalysisSignal, TaskStatus } from "@/backend/server/db/client";
import { getPolymarketMarket } from "@/backend/services/polymarket/markets";
import { getMarketAnalysis } from "@/backend/services/analysis/marketAnalysis";
import { getTopPolymarketTraders, getTraderActivity } from "@/backend/services/polymarket/traders";
import {
  createCopyTradeTask,
  getCopyTradeTask,
  listCopyTradeTasks,
  deleteCopyTradeTask,
  updateCopyTradeTaskStatus,
  getCopyTradeTaskPerformance,
} from "@/backend/services/copytrade/tasks";
import { getTokenConfidenceAnalysis } from "@/backend/services/confidence/analysis";

export type ToolName =
  | "get_media_sentiment"
  | "get_confidence_score"
  | "get_token_info"
  | "get_timesnet_forecast"
  | "get_timesnet_anomaly"
  | "get_timesnet_analysis"
  | "get_wallet_status"
  | "get_polymarket_market_info"
  | "get_polymarket_market_analysis"
  | "get_top_polymarket_traders"
  | "get_trader_activity"
  | "create_copy_trade_task"
  | "get_copy_trade_tasks"
  | "get_copy_trade_task"
  | "pause_copy_trade_task"
  | "resume_copy_trade_task"
  | "stop_copy_trade_task"
  | "delete_copy_trade_task";

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

async function requireUser(actor?: ActorContext) {
  const resolvedActor = await requireActorUser(actor);
  const user = await (resolvedActor.channel === "telegram"
    ? db.findUserById(resolvedActor.userId)
    : getSessionUser());

  if (!user) {
    throw new Error("Wallet session required. Connect a wallet from the dashboard first.");
  }

  return user;
}

function getRequiredStringArg(args: Record<string, unknown>, key: string): string | null {
  const value = args[key];
  return typeof value === "string" && value ? value : null;
}

function getOptionalNumberArg(args: Record<string, unknown>, key: string): number | undefined {
  const value = args[key];
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function getRequiredNumberArg(args: Record<string, unknown>, key: string): number | null {
  return getOptionalNumberArg(args, key) ?? null;
}

function createMissingArgResult(message: string): ToolResult {
  return { success: false, error: message };
}

async function handleWalletTool(actor?: ActorContext): Promise<ToolResult> {
  const user = await requireUser(actor);
  const [wallets, vaults] = await Promise.all([
    db.listWalletConnections(user.id),
    db.listTradingVaults(user.id),
  ]);

  return {
    success: true,
    data: {
      user,
      wallets,
      vaults,
    },
  };
}

async function handlePolymarketTool(
  toolName: ToolName,
  args: Record<string, unknown>
): Promise<ToolResult | null> {
  switch (toolName) {
    case "get_polymarket_market_info": {
      const marketId = getRequiredStringArg(args, "marketId");
      if (!marketId) {
        return createMissingArgResult("marketId is required");
      }

      return {
        success: true,
        data: await getPolymarketMarket(marketId),
      };
    }

    case "get_polymarket_market_analysis": {
      const marketId = getRequiredStringArg(args, "marketId");
      if (!marketId) {
        return createMissingArgResult("marketId is required");
      }

      return {
        success: true,
        data: await getMarketAnalysis(marketId),
      };
    }

    case "get_top_polymarket_traders": {
      return {
        success: true,
        data: await getTopPolymarketTraders(getOptionalNumberArg(args, "limit") ?? 10),
      };
    }

    case "get_trader_activity": {
      const address = getRequiredStringArg(args, "address");
      if (!address) {
        return createMissingArgResult("address is required");
      }

      return {
        success: true,
        data: await getTraderActivity(address),
      };
    }

    default:
      return null;
  }
}

async function handleCopyTradeStatusUpdate(
  args: Record<string, unknown>,
  actor: ActorContext | undefined,
  status: TaskStatus,
  reason?: string
): Promise<ToolResult> {
  const user = await requireUser(actor);
  const taskId = getRequiredStringArg(args, "taskId");

  if (!taskId) {
    return createMissingArgResult("taskId is required");
  }

  return {
    success: true,
    data: await updateCopyTradeTaskStatus(taskId, user.id, status, reason),
  };
}

async function handleCopyTradeTool(
  toolName: ToolName,
  args: Record<string, unknown>,
  actor?: ActorContext
): Promise<ToolResult | null> {
  switch (toolName) {
    case "create_copy_trade_task": {
      const user = await requireUser(actor);
      const walletConnectionId = getRequiredStringArg(args, "walletConnectionId");
      const traderAddress = getRequiredStringArg(args, "traderAddress");
      const name = getRequiredStringArg(args, "name");
      const allocationUsd = getRequiredNumberArg(args, "allocationUsd");

      if (!walletConnectionId || !traderAddress || !name || !allocationUsd) {
        return createMissingArgResult(
          "walletConnectionId, traderAddress, name, and allocationUsd are required"
        );
      }

      return {
        success: true,
        data: await createCopyTradeTask({
          userId: user.id,
          walletConnectionId,
          traderAddress,
          name,
          allocationUsd,
          takeProfitPercent: getOptionalNumberArg(args, "takeProfitPercent"),
          stopLossPercent: getOptionalNumberArg(args, "stopLossPercent"),
          timesnetEnabled: true,
          timesnetMinimumConfidence: getOptionalNumberArg(args, "timesnetMinimumConfidence"),
          timesnetRequiredSignal: AnalysisSignal.BUY,
        }),
      };
    }

    case "get_copy_trade_tasks": {
      const user = await requireUser(actor);
      return {
        success: true,
        data: await listCopyTradeTasks(user.id),
      };
    }

    case "get_copy_trade_task": {
      const user = await requireUser(actor);
      const taskId = getRequiredStringArg(args, "taskId");
      if (!taskId) {
        return createMissingArgResult("taskId is required");
      }

      return {
        success: true,
        data: {
          task: await getCopyTradeTask(taskId, user.id),
          performance: await getCopyTradeTaskPerformance(taskId, user.id),
        },
      };
    }

    case "pause_copy_trade_task":
      return handleCopyTradeStatusUpdate(args, actor, TaskStatus.PAUSED);

    case "resume_copy_trade_task":
      return handleCopyTradeStatusUpdate(args, actor, TaskStatus.ACTIVE);

    case "stop_copy_trade_task":
      return handleCopyTradeStatusUpdate(
        args,
        actor,
        TaskStatus.STOPPED,
        getRequiredStringArg(args, "reason") || "Stopped from agent"
      );

    case "delete_copy_trade_task": {
      const user = await requireUser(actor);
      const taskId = getRequiredStringArg(args, "taskId");
      if (!taskId) {
        return createMissingArgResult("taskId is required");
      }

      return {
        success: true,
        data: await deleteCopyTradeTask(taskId, user.id),
      };
    }

    default:
      return null;
  }
}

async function handleSignalTool(
  toolName: ToolName,
  args: Record<string, unknown>,
  context?: TraceContext
): Promise<ToolResult | null> {
  const marketData = getMarketDataClient();

  switch (toolName) {
    case "get_media_sentiment": {
      const tokenSymbol = getRequiredStringArg(args, "tokenSymbol");
      const tokenAddress = getRequiredStringArg(args, "tokenAddress") || undefined;

      if (!tokenSymbol) {
        return createMissingArgResult("tokenSymbol is required");
      }

      const sentiment = await getMediaSentiment(tokenSymbol, tokenAddress);

      return {
        success: true,
        data: {
          symbol: tokenSymbol,
          sentiment: {
            score: sentiment.sentimentScore,
            label: sentiment.sentimentLabel,
            mentions24h: sentiment.mentions24h,
            trendingRank: sentiment.trendingRank,
            momentum: sentiment.trendingMomentum,
          },
        },
      };
    }

    case "get_confidence_score": {
      const tokenSymbol = getRequiredStringArg(args, "tokenSymbol");

      if (!tokenSymbol) {
        return createMissingArgResult("tokenSymbol is required");
      }

      const analysis = await getTokenConfidenceAnalysis(tokenSymbol, context);

      return {
        success: true,
        data: {
          token: analysis.token.symbol,
          score: analysis.confidence.score,
          signal: analysis.confidence.signal,
          reliability: analysis.confidence.reliability,
          components: analysis.confidence.components,
          reasoning: analysis.confidence.reasoning,
          warnings: analysis.confidence.warnings,
          summary: analysis.summary,
        },
      };
    }

    case "get_token_info": {
      const tokenSymbol = getRequiredStringArg(args, "tokenSymbol");
      if (!tokenSymbol) {
        return createMissingArgResult("tokenSymbol is required");
      }

      const tokenInfo = await marketData.getTokenInfo(tokenSymbol, context);

      return {
        success: true,
        data: {
          exchangeId: tokenInfo.exchangeId,
          symbol: tokenInfo.symbol,
          base: tokenInfo.base,
          quote: tokenInfo.quote,
          price: tokenInfo.price,
          priceChange24h: tokenInfo.priceChange24h,
          volume24h: tokenInfo.volume24h,
          high24h: tokenInfo.high24h,
          low24h: tokenInfo.low24h,
          bid: tokenInfo.bid,
          ask: tokenInfo.ask,
        },
      };
    }

    default:
      return null;
  }
}

async function runTimesNetQuery(
  tokenSymbol: string,
  queryType: "forecast" | "anomaly" | "full",
  insufficientHistoryError: string,
  fallbackError: string,
  context?: TraceContext
) {
  const priceHistory = await getTokenPriceHistory(tokenSymbol, context);

  if (!priceHistory || priceHistory.length < 20) {
    return { success: false as const, error: insufficientHistoryError };
  }

  const timesnetResult = await queryTimesNet(
    {
      token_symbol: tokenSymbol,
      query_type: queryType,
      price_history: priceHistory,
    },
    context
  );

  if (!timesnetResult.success || !timesnetResult.data) {
    return { success: false as const, error: timesnetResult.error || fallbackError };
  }

  return { success: true as const, data: timesnetResult.data };
}

async function handleTimesNetTool(
  toolName: ToolName,
  args: Record<string, unknown>,
  context?: TraceContext
): Promise<ToolResult | null> {
  const tokenSymbol = getRequiredStringArg(args, "tokenSymbol");

  if (!["get_timesnet_forecast", "get_timesnet_anomaly", "get_timesnet_analysis"].includes(toolName)) {
    return null;
  }

  if (!tokenSymbol) {
    return createMissingArgResult("tokenSymbol is required");
  }

  switch (toolName) {
    case "get_timesnet_forecast": {
      const result = await runTimesNetQuery(
        tokenSymbol,
        "forecast",
        "Insufficient price history for forecast",
        "TimesNet forecast failed",
        context
      );

      if (!result.success) {
        return { success: false, error: result.error };
      }

      return {
        success: true,
        data: {
          token: tokenSymbol,
          forecast: {
            summary: result.data.summary,
            signal: result.data.signal,
            confidence: result.data.confidence,
            details: result.data.details,
          },
        },
      };
    }

    case "get_timesnet_anomaly": {
      const result = await runTimesNetQuery(
        tokenSymbol,
        "anomaly",
        "Insufficient price history for anomaly detection",
        "TimesNet anomaly detection failed",
        context
      );

      if (!result.success) {
        return { success: false, error: result.error };
      }

      return {
        success: true,
        data: {
          token: tokenSymbol,
          anomaly: {
            summary: result.data.summary,
            signal: result.data.signal,
            confidence: result.data.confidence,
            details: result.data.details,
          },
        },
      };
    }

    case "get_timesnet_analysis": {
      const result = await runTimesNetQuery(
        tokenSymbol,
        "full",
        "Insufficient price history for analysis",
        "TimesNet analysis failed",
        context
      );

      if (!result.success) {
        return { success: false, error: result.error };
      }

      const details = result.data.details as Record<string, unknown> | undefined;

      return {
        success: true,
        data: {
          token: tokenSymbol,
          analysis: {
            summary: result.data.summary,
            signal: result.data.signal,
            confidence: result.data.confidence,
            prediction: details?.prediction,
            anomaly: details?.anomaly,
            recommendedAction: details?.action,
          },
        },
      };
    }

    default:
      return null;
  }
}

/**
 * Execute a tool by name with given arguments
 */
export async function executeTool(
  toolName: ToolName,
  args: Record<string, unknown>,
  context?: TraceContext,
  actor?: ActorContext
): Promise<ToolResult> {
  try {
    if (toolName === "get_wallet_status") {
      return await handleWalletTool(actor);
    }

    const polymarketResult = await handlePolymarketTool(toolName, args);
    if (polymarketResult) {
      return polymarketResult;
    }

    const copyTradeResult = await handleCopyTradeTool(toolName, args, actor);
    if (copyTradeResult) {
      return copyTradeResult;
    }

    const signalResult = await handleSignalTool(toolName, args, context);
    if (signalResult) {
      return signalResult;
    }

    const timesNetResult = await handleTimesNetTool(toolName, args, context);
    if (timesNetResult) {
      return timesNetResult;
    }

    return { success: false, error: `Unknown tool: ${toolName}` };
  } catch (error) {
    logError("Tool execution failed", error, {
      operation: "agent_tool_execution",
      tool_name: toolName,
      outcome: "error",
    }, context);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

async function getTokenPriceHistory(
  tokenSymbol: string,
  context?: TraceContext
): Promise<number[] | null> {
  try {
    return await getMarketDataClient().getPriceHistory(tokenSymbol, "15m", 96, context);
  } catch (error) {
    logError("Failed to load token price history for TimesNet", error, {
      service: "timesnet",
      operation: "timesnet_prepare_price_history",
      outcome: "error",
      token_symbol: tokenSymbol,
    }, context);
    return null;
  }
}
