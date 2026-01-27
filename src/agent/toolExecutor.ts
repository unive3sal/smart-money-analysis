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
  | "get_trending_tokens"
  | "get_timesnet_forecast"
  | "get_timesnet_anomaly"
  | "get_timesnet_analysis";

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
        // Validate timeframe - Birdeye only accepts: 30m, 1h, 2h, 4h, 6h, 8h, 24h (12h NOT supported on Solana)
        const rawTimeframe = String(args.timeframe || "24h").toLowerCase();
        const validTimeframes = ["30m", "1h", "2h", "4h", "6h", "8h", "24h"] as const;
        const timeframe = validTimeframes.includes(rawTimeframe as typeof validTimeframes[number]) 
          ? (rawTimeframe as typeof validTimeframes[number])
          : "24h";
        // Birdeye API limit is 1-10 for top_traders endpoint
        const limit = Math.min(Number(args.limit) || 10, 10);
        // Default to wrapped SOL token
        const tokenAddress = (args.tokenAddress as string) || "So11111111111111111111111111111111111111112";

        const traders = await birdeye.getTopTraders(tokenAddress, timeframe, limit);

        return {
          success: true,
          data: {
            tokenAddress,
            timeframe,
            count: traders.length,
            traders: traders.map((t) => ({
              owner: t.owner,
              volume: t.volume,
              trade: t.trade,
              tradeBuy: t.tradeBuy,
              tradeSell: t.tradeSell,
              volumeBuy: t.volumeBuy,
              volumeSell: t.volumeSell,
              tags: t.tags,
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

        // Calculate total value from items
        const totalValueUsd = portfolio.items.reduce((sum, item) => sum + (item.valueUsd || 0), 0);

        return {
          success: true,
          data: {
            wallet: walletAddress,
            totalValueUsd,
            holdingsCount: portfolio.items.length,
            topHoldings: portfolio.items.slice(0, 10).map((t) => ({
              symbol: t.symbol,
              valueUsd: t.valueUsd,
              balance: t.uiAmount,
            })),
            recentTransactions: transactions.slice(0, 10).map((tx) => ({
              hash: tx.txHash,
              time: tx.blockTime, // Already ISO string
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
            volume24h: tokenInfo?.v24hUSD || 0,
            liquidity: tokenInfo?.liquidity || 0,
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
            priceChange24h: tokenInfo.priceChange24hPercent,
            volume24h: tokenInfo.v24hUSD,
            marketCap: tokenInfo.marketCap,
            holders: tokenInfo.holder,
            liquidity: tokenInfo.liquidity,
            totalSupply: tokenInfo.totalSupply,
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
              marketCap: t.market_cap,
              volume24h: t.volume_24h_usd,
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
              liquidity: t.liquidity,
              volume24h: t.volume24hUSD,
              rank: t.rank,
            })),
          },
        };
      }

      case "get_timesnet_forecast": {
        const tokenSymbol = args.tokenSymbol as string;
        const tokenAddress = args.tokenAddress as string | undefined;

        if (!tokenSymbol) {
          return { success: false, error: "tokenSymbol is required" };
        }

        // Get price history from Birdeye
        const priceHistory = await getTokenPriceHistory(birdeye, tokenSymbol, tokenAddress);
        
        if (!priceHistory || priceHistory.length < 20) {
          return { success: false, error: "Insufficient price history for forecast" };
        }

        // Call TimesNet service
        const timesnetResult = await callTimesNetService("/query", {
          token_symbol: tokenSymbol,
          token_address: tokenAddress,
          query_type: "forecast",
          price_history: priceHistory,
        });

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
        const tokenAddress = args.tokenAddress as string | undefined;

        if (!tokenSymbol) {
          return { success: false, error: "tokenSymbol is required" };
        }

        // Get price history from Birdeye
        const priceHistory = await getTokenPriceHistory(birdeye, tokenSymbol, tokenAddress);
        
        if (!priceHistory || priceHistory.length < 20) {
          return { success: false, error: "Insufficient price history for anomaly detection" };
        }

        // Call TimesNet service
        const timesnetResult = await callTimesNetService("/query", {
          token_symbol: tokenSymbol,
          token_address: tokenAddress,
          query_type: "anomaly",
          price_history: priceHistory,
        });

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
        const tokenAddress = args.tokenAddress as string | undefined;

        if (!tokenSymbol) {
          return { success: false, error: "tokenSymbol is required" };
        }

        // Get price history from Birdeye
        const priceHistory = await getTokenPriceHistory(birdeye, tokenSymbol, tokenAddress);
        
        if (!priceHistory || priceHistory.length < 20) {
          return { success: false, error: "Insufficient price history for analysis" };
        }

        // Call TimesNet service for full analysis
        const timesnetResult = await callTimesNetService("/query", {
          token_symbol: tokenSymbol,
          token_address: tokenAddress,
          query_type: "full",
          price_history: priceHistory,
        });

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
              forecast: details?.forecast,
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
    console.error(`Tool execution error (${toolName}):`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

// TimesNet Service URL
const TIMESNET_SERVICE_URL = process.env.TIMESNET_SERVICE_URL || "http://localhost:8001";

/**
 * Call the TimesNet service
 */
async function callTimesNetService(
  endpoint: string,
  body: Record<string, unknown>
): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }> {
  try {
    const response = await fetch(`${TIMESNET_SERVICE_URL}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `TimesNet service error: ${errorText}` };
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    console.error("TimesNet service call failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to connect to TimesNet service",
    };
  }
}

/**
 * Get token price history for TimesNet
 */
async function getTokenPriceHistory(
  birdeye: ReturnType<typeof getBirdeyeClient>,
  tokenSymbol: string,
  tokenAddress?: string
): Promise<number[] | null> {
  try {
    // If no address, try to search for it
    let address = tokenAddress;
    if (!address) {
      const searchResults = await birdeye.searchToken(tokenSymbol);
      if (searchResults.length > 0) {
        address = searchResults[0].address;
      } else {
        // Use SOL as fallback
        address = "So11111111111111111111111111111111111111112";
      }
    }

    // Get price history (15-minute intervals for last 24 hours)
    const now = Math.floor(Date.now() / 1000);
    const dayAgo = now - 24 * 60 * 60;
    
    const priceData = await birdeye.getTokenPriceHistory(
      address,
      "15m",
      dayAgo,
      now
    );
    
    if (!priceData || !priceData.items || priceData.items.length < 20) {
      return null;
    }

    // Extract prices (value field contains the price)
    return priceData.items.map((item) => item.value);
  } catch (error) {
    console.error("Failed to get price history:", error);
    return null;
  }
}
