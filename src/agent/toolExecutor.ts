/**
 * Tool executor - handles actual execution of agent tools
 */

import { getBirdeyeClient } from "@/services/birdeye/client";
import {
  extractWalletFeatures,
  generateFeatureSummary,
} from "@/services/features/extractor";
import { getMediaSentiment } from "@/services/media/sentiment";
import {
  calculateConfidence,
  generateConfidenceSummary,
} from "@/services/confidence/calculator";
import { ConfidenceInput } from "@/services/confidence/types";

export type ToolName =
  | "fetch_top_traders"
  | "analyze_wallet"
  | "get_extracted_features"
  | "get_media_sentiment"
  | "get_confidence_score"
  | "get_token_info"
  | "search_token"
  | "get_trending_tokens";

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

/**
 * Execute a tool by name with given arguments
 */
export async function executeTool(
  toolName: ToolName,
  args: Record<string, unknown>
): Promise<ToolResult> {
  try {
    const birdeye = getBirdeyeClient();

    switch (toolName) {
      case "fetch_top_traders": {
        const timeframe = (args.timeframe as "24h" | "7d" | "30d") || "24h";
        const limit = Math.min(Number(args.limit) || 20, 50);

        const traders = await birdeye.getTopTraders(timeframe, limit);

        return {
          success: true,
          data: {
            timeframe,
            count: traders.length,
            traders: traders.map((t) => ({
              address: t.address,
              pnl: t.pnl,
              pnlPercent: t.pnlPercent,
              winRate: t.winRate,
              tradeCount: t.tradeCount,
              volume: t.volume,
            })),
          },
        };
      }

      case "analyze_wallet": {
        const walletAddress = args.walletAddress as string;
        if (!walletAddress) {
          return { success: false, error: "walletAddress is required" };
        }

        const [portfolio, transactions] = await Promise.all([
          birdeye.getWalletPortfolio(walletAddress),
          birdeye.getWalletTransactions(walletAddress, 50),
        ]);

        return {
          success: true,
          data: {
            wallet: walletAddress,
            totalValueUsd: portfolio.totalUsd,
            holdingsCount: portfolio.items.length,
            topHoldings: portfolio.items.slice(0, 10).map((t) => ({
              symbol: t.symbol,
              valueUsd: t.valueUsd,
              balance: t.uiAmount,
            })),
            recentTransactions: transactions.items.slice(0, 10).map((tx) => ({
              hash: tx.txHash,
              time: new Date(tx.blockTime * 1000).toISOString(),
              action: tx.mainAction,
              transfers: tx.tokenTransfers.length,
            })),
          },
        };
      }

      case "get_extracted_features": {
        const walletAddress = args.walletAddress as string;
        if (!walletAddress) {
          return { success: false, error: "walletAddress is required" };
        }

        const features = await extractWalletFeatures(walletAddress);
        const summary = generateFeatureSummary(features);

        return {
          success: true,
          data: {
            summary,
            details: {
              trading: features.trading,
              performance: features.performance,
              risk: features.risk,
              recentActivity: features.recentActivity,
            },
          },
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
        const tokenAddress = args.tokenAddress as string;
        const tokenSymbol = (args.tokenSymbol as string) || "UNKNOWN";

        if (!tokenAddress) {
          return { success: false, error: "tokenAddress is required" };
        }

        // Gather data for confidence calculation
        const [tokenInfo, sentiment] = await Promise.all([
          birdeye.getTokenInfo(tokenAddress).catch(() => null),
          getMediaSentiment(tokenSymbol, tokenAddress),
        ]);

        // Build confidence input
        const confidenceInput: ConfidenceInput = {
          smartMoney: {
            // These would come from aggregated smart money data
            netFlow24h: 10000, // Placeholder - would aggregate from top traders
            uniqueBuyers: 5,
            uniqueSellers: 2,
            topWalletAction: "buy",
            avgWinRate: 0.55,
            recentPnl: 5000,
          },
          media: {
            sentimentScore: sentiment.sentimentScore,
            mentions24h: sentiment.mentions24h,
            trendingRank: sentiment.trendingRank,
          },
          token: {
            marketCap: tokenInfo?.marketCap || 0,
            volume24h: tokenInfo?.volume24h || 0,
            liquidity: (tokenInfo?.marketCap || 0) * 0.05, // Estimate
            ageHours: 168, // Would need historical data
            holderCount: tokenInfo?.holder || 0,
          },
        };

        const confidence = calculateConfidence(confidenceInput);
        const summary = generateConfidenceSummary(confidence);

        return {
          success: true,
          data: {
            token: tokenSymbol,
            address: tokenAddress,
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
        const tokenAddress = args.tokenAddress as string;
        if (!tokenAddress) {
          return { success: false, error: "tokenAddress is required" };
        }

        const tokenInfo = await birdeye.getTokenInfo(tokenAddress);

        return {
          success: true,
          data: {
            address: tokenInfo.address,
            symbol: tokenInfo.symbol,
            name: tokenInfo.name,
            price: tokenInfo.price,
            priceChange24h: tokenInfo.priceChange24h,
            volume24h: tokenInfo.volume24h,
            marketCap: tokenInfo.marketCap,
            holders: tokenInfo.holder,
            supply: tokenInfo.supply,
          },
        };
      }

      case "search_token": {
        const query = args.query as string;
        if (!query) {
          return { success: false, error: "query is required" };
        }

        const results = await birdeye.searchToken(query);

        return {
          success: true,
          data: {
            query,
            results: results.slice(0, 10).map((t) => ({
              address: t.address,
              symbol: t.symbol,
              name: t.name,
              price: t.price,
              marketCap: t.marketCap,
            })),
          },
        };
      }

      case "get_trending_tokens": {
        const limit = Math.min(Number(args.limit) || 10, 20);

        const trending = await birdeye.getTrendingTokens(limit);

        return {
          success: true,
          data: {
            count: trending.length,
            tokens: trending.map((t) => ({
              address: t.address,
              symbol: t.symbol,
              name: t.name,
              price: t.price,
              priceChange24h: t.priceChange24h,
              volume24h: t.volume24h,
              marketCap: t.marketCap,
            })),
          },
        };
      }

      default:
        return { success: false, error: `Unknown tool: ${toolName}` };
    }
  } catch (error) {
    console.error(`Tool execution error (${toolName}):`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}
