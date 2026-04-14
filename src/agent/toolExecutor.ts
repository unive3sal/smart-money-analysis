/**
 * Tool executor - handles actual execution of agent tools
 */

import { getMediaSentiment } from "@/services/media/sentiment";
import {
  calculateConfidence,
  generateConfidenceSummary,
} from "@/services/confidence/calculator";
import { ConfidenceInput } from "@/services/confidence/types";
import { type TraceContext, logError } from "@/lib/observability";
import { queryTimesNet } from "@/services/timesnet/client";
import { getMarketDataClient } from "@/services/marketData";
import { getSessionUser } from "@/server/auth/session";
import { db, AnalysisSignal, TaskStatus } from "@/server/db/client";
import { getPolymarketMarket } from "@/services/polymarket/markets";
import { getMarketAnalysis } from "@/services/analysis/marketAnalysis";
import { getTopPolymarketTraders, getTraderActivity } from "@/services/polymarket/traders";
import {
  createCopyTradeTask,
  getCopyTradeTask,
  listCopyTradeTasks,
  deleteCopyTradeTask,
  updateCopyTradeTaskStatus,
  getCopyTradeTaskPerformance,
} from "@/services/copytrade/tasks";

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

async function requireUser() {
  const user = await getSessionUser();

  if (!user) {
    throw new Error("Wallet session required. Connect a wallet from the dashboard first.");
  }

  return user;
}

/**
 * Execute a tool by name with given arguments
 */
export async function executeTool(
  toolName: ToolName,
  args: Record<string, unknown>,
  context?: TraceContext
): Promise<ToolResult> {
  try {
    const marketData = getMarketDataClient();

    switch (toolName) {
      case "get_wallet_status": {
        const user = await requireUser();
        const [wallets, vaults] = await Promise.all([
          db.getCurrentUserWalletConnections(),
          db.getCurrentUserTradingVaults(),
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

      case "get_polymarket_market_info": {
        const marketId = args.marketId as string;
        if (!marketId) {
          return { success: false, error: "marketId is required" };
        }

        return {
          success: true,
          data: await getPolymarketMarket(marketId),
        };
      }

      case "get_polymarket_market_analysis": {
        const marketId = args.marketId as string;
        if (!marketId) {
          return { success: false, error: "marketId is required" };
        }

        return {
          success: true,
          data: await getMarketAnalysis(marketId),
        };
      }

      case "get_top_polymarket_traders": {
        const limit = Number(args.limit || 10);
        return {
          success: true,
          data: await getTopPolymarketTraders(limit),
        };
      }

      case "get_trader_activity": {
        const address = args.address as string;
        if (!address) {
          return { success: false, error: "address is required" };
        }

        return {
          success: true,
          data: await getTraderActivity(address),
        };
      }

      case "create_copy_trade_task": {
        const user = await requireUser();
        const walletConnectionId = args.walletConnectionId as string | undefined;
        const traderAddress = args.traderAddress as string;
        const name = args.name as string;
        const allocationUsd = Number(args.allocationUsd || 0);

        if (!walletConnectionId || !traderAddress || !name || !allocationUsd) {
          return {
            success: false,
            error: "walletConnectionId, traderAddress, name, and allocationUsd are required",
          };
        }

        return {
          success: true,
          data: await createCopyTradeTask({
            userId: user.id,
            walletConnectionId,
            traderAddress,
            name,
            allocationUsd,
            takeProfitPercent: args.takeProfitPercent ? Number(args.takeProfitPercent) : undefined,
            stopLossPercent: args.stopLossPercent ? Number(args.stopLossPercent) : undefined,
            timesnetEnabled: true,
            timesnetMinimumConfidence: args.timesnetMinimumConfidence ? Number(args.timesnetMinimumConfidence) : undefined,
            timesnetRequiredSignal: AnalysisSignal.BUY,
          }),
        };
      }

      case "get_copy_trade_tasks": {
        const user = await requireUser();
        return {
          success: true,
          data: await listCopyTradeTasks(user.id),
        };
      }

      case "get_copy_trade_task": {
        const user = await requireUser();
        const taskId = args.taskId as string;
        if (!taskId) {
          return { success: false, error: "taskId is required" };
        }

        return {
          success: true,
          data: {
            task: await getCopyTradeTask(taskId, user.id),
            performance: await getCopyTradeTaskPerformance(taskId, user.id),
          },
        };
      }

      case "pause_copy_trade_task": {
        const user = await requireUser();
        const taskId = args.taskId as string;
        if (!taskId) {
          return { success: false, error: "taskId is required" };
        }

        return {
          success: true,
          data: await updateCopyTradeTaskStatus(taskId, user.id, TaskStatus.PAUSED),
        };
      }

      case "resume_copy_trade_task": {
        const user = await requireUser();
        const taskId = args.taskId as string;
        if (!taskId) {
          return { success: false, error: "taskId is required" };
        }

        return {
          success: true,
          data: await updateCopyTradeTaskStatus(taskId, user.id, TaskStatus.ACTIVE),
        };
      }

      case "stop_copy_trade_task": {
        const user = await requireUser();
        const taskId = args.taskId as string;
        if (!taskId) {
          return { success: false, error: "taskId is required" };
        }

        return {
          success: true,
          data: await updateCopyTradeTaskStatus(
            taskId,
            user.id,
            TaskStatus.STOPPED,
            (args.reason as string) || "Stopped from agent"
          ),
        };
      }

      case "delete_copy_trade_task": {
        const user = await requireUser();
        const taskId = args.taskId as string;
        if (!taskId) {
          return { success: false, error: "taskId is required" };
        }

        return {
          success: true,
          data: await deleteCopyTradeTask(taskId, user.id),
        };
      }

      case "get_media_sentiment": {
        const tokenSymbol = args.tokenSymbol as string;
        const tokenAddress = args.tokenAddress as string | undefined;

        if (!tokenSymbol) {
          return { success: false, error: "tokenSymbol is required" };
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
        const tokenSymbol = args.tokenSymbol as string;

        if (!tokenSymbol) {
          return { success: false, error: "tokenSymbol is required" };
        }

        const [tokenInfo, sentiment] = await Promise.all([
          marketData.getTokenInfo(tokenSymbol, context).catch(() => null),
          getMediaSentiment(tokenSymbol),
        ]);

        const confidenceInput: ConfidenceInput = {
          marketActivity: {
            netFlow24h: 0,
            uniqueBuyers: 0,
            uniqueSellers: 0,
            dominantSide: "hold",
            avgWinRate: 0,
            recentPnl: 0,
          },
          media: {
            sentimentScore: sentiment.sentimentScore,
            mentions24h: sentiment.mentions24h,
            trendingRank: sentiment.trendingRank,
          },
          token: {
            marketCap: 0,
            volume24h: tokenInfo?.volume24h || 0,
            liquidity: 0,
            ageHours: 168,
            holderCount: 0,
          },
        };

        const confidence = calculateConfidence(confidenceInput);
        const summary = generateConfidenceSummary(confidence);

        return {
          success: true,
          data: {
            token: tokenInfo?.symbol || tokenSymbol,
            score: confidence.score,
            signal: confidence.signal,
            reliability: confidence.reliability,
            components: confidence.components,
            reasoning: confidence.reasoning,
            warnings: confidence.warnings,
            summary,
          },
        };
      }

      case "get_token_info": {
        const tokenSymbol = args.tokenSymbol as string;
        if (!tokenSymbol) {
          return { success: false, error: "tokenSymbol is required" };
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

      case "get_timesnet_forecast": {
        const tokenSymbol = args.tokenSymbol as string;

        if (!tokenSymbol) {
          return { success: false, error: "tokenSymbol is required" };
        }

        const priceHistory = await getTokenPriceHistory(tokenSymbol, context);

        if (!priceHistory || priceHistory.length < 20) {
          return { success: false, error: "Insufficient price history for forecast" };
        }

        const timesnetResult = await queryTimesNet({
          token_symbol: tokenSymbol,
          query_type: "forecast",
          price_history: priceHistory,
        }, context);

        if (!timesnetResult.success || !timesnetResult.data) {
          return { success: false, error: timesnetResult.error || "TimesNet forecast failed" };
        }

        return {
          success: true,
          data: {
            token: tokenSymbol,
            forecast: {
              summary: timesnetResult.data.summary,
              signal: timesnetResult.data.signal,
              confidence: timesnetResult.data.confidence,
              details: timesnetResult.data.details,
            },
          },
        };
      }

      case "get_timesnet_anomaly": {
        const tokenSymbol = args.tokenSymbol as string;

        if (!tokenSymbol) {
          return { success: false, error: "tokenSymbol is required" };
        }

        const priceHistory = await getTokenPriceHistory(tokenSymbol, context);

        if (!priceHistory || priceHistory.length < 20) {
          return { success: false, error: "Insufficient price history for anomaly detection" };
        }

        const timesnetResult = await queryTimesNet({
          token_symbol: tokenSymbol,
          query_type: "anomaly",
          price_history: priceHistory,
        }, context);

        if (!timesnetResult.success || !timesnetResult.data) {
          return { success: false, error: timesnetResult.error || "TimesNet anomaly detection failed" };
        }

        return {
          success: true,
          data: {
            token: tokenSymbol,
            anomaly: {
              summary: timesnetResult.data.summary,
              signal: timesnetResult.data.signal,
              confidence: timesnetResult.data.confidence,
              details: timesnetResult.data.details,
            },
          },
        };
      }

      case "get_timesnet_analysis": {
        const tokenSymbol = args.tokenSymbol as string;

        if (!tokenSymbol) {
          return { success: false, error: "tokenSymbol is required" };
        }

        const priceHistory = await getTokenPriceHistory(tokenSymbol, context);

        if (!priceHistory || priceHistory.length < 20) {
          return { success: false, error: "Insufficient price history for analysis" };
        }

        const timesnetResult = await queryTimesNet({
          token_symbol: tokenSymbol,
          query_type: "full",
          price_history: priceHistory,
        }, context);

        if (!timesnetResult.success || !timesnetResult.data) {
          return { success: false, error: timesnetResult.error || "TimesNet analysis failed" };
        }

        const details = timesnetResult.data.details as Record<string, unknown> | undefined;

        return {
          success: true,
          data: {
            token: tokenSymbol,
            analysis: {
              summary: timesnetResult.data.summary,
              signal: timesnetResult.data.signal,
              confidence: timesnetResult.data.confidence,
              prediction: details?.prediction,
              anomaly: details?.anomaly,
              recommendedAction: details?.action,
            },
          },
        };
      }

      default:
        return { success: false, error: `Unknown tool: ${toolName}` };
    }
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
