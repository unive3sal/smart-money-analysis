import { getBirdeyeClient } from "../birdeye/client";
import { WalletTransaction, WalletToken, BalanceChange } from "../birdeye/types";
import { WalletFeatures, WalletFeatureSummary } from "./types";

/**
 * Helper to parse blockTime (ISO string) to timestamp
 */
function parseBlockTime(blockTime: string): number {
  return new Date(blockTime).getTime();
}

/**
 * Extract structured features from wallet data
 */
export async function extractWalletFeatures(
  walletAddress: string
): Promise<WalletFeatures> {
  const birdeye = getBirdeyeClient();

  // Fetch wallet data in parallel
  const [portfolio, transactions] = await Promise.all([
    birdeye.getWalletPortfolio(walletAddress),
    birdeye.getWalletTransactions(walletAddress, 100),
  ]);

  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
  const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;

  // Filter recent transactions (blockTime is ISO string)
  const recentTxs = transactions.filter(
    (tx) => parseBlockTime(tx.blockTime) > thirtyDaysAgo
  );
  const last24hTxs = transactions.filter(
    (tx) => parseBlockTime(tx.blockTime) > twentyFourHoursAgo
  );

  // Calculate total portfolio value
  const totalPortfolioUsd = portfolio.items.reduce((sum, t) => sum + (t.valueUsd || 0), 0);

  // Calculate trading behavior
  const tradingBehavior = calculateTradingBehavior(recentTxs);

  // Calculate performance metrics
  const performance = calculatePerformance(recentTxs);

  // Determine preferences
  const preferences = await determinePreferences(recentTxs);

  // Calculate risk profile
  const riskProfile = calculateRiskProfile(totalPortfolioUsd, portfolio.items, recentTxs);

  // Recent activity
  const recentActivity = calculateRecentActivity(last24hTxs, portfolio.items);

  return {
    walletAddress,
    snapshotTimestamp: now,
    trading: tradingBehavior,
    performance,
    preferences,
    risk: riskProfile,
    recentActivity,
  };
}

function calculateTradingBehavior(transactions: WalletTransaction[]) {
  if (transactions.length === 0) {
    return {
      avgHoldTimeMinutes: 0,
      tradeFrequencyPerDay: 0,
      avgPositionSizeUsd: 0,
      preferredTradingHours: [],
      totalTrades30d: 0,
      uniqueTokensTraded: 0,
    };
  }

  // Calculate trade frequency
  const oldestTxTime = parseBlockTime(transactions[transactions.length - 1].blockTime);
  const daysSpan = Math.max(
    1,
    (Date.now() - oldestTxTime) / (24 * 60 * 60 * 1000)
  );
  const tradeFrequencyPerDay = transactions.length / daysSpan;

  // Calculate average position size from balance changes
  const positionSizes = transactions.flatMap((tx) =>
    tx.balanceChange.map((bc) => Math.abs(bc.amount))
  );
  const avgPositionSizeUsd =
    positionSizes.length > 0
      ? positionSizes.reduce((a, b) => a + b, 0) / positionSizes.length
      : 0;

  // Determine preferred trading hours
  const hourCounts = new Map<number, number>();
  transactions.forEach((tx) => {
    const hour = new Date(tx.blockTime).getUTCHours();
    hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
  });

  const preferredTradingHours = Array.from(hourCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([hour]) => hour);

  // Count unique tokens from balance changes
  const uniqueTokens = new Set(
    transactions.flatMap((tx) => tx.balanceChange.map((bc) => bc.address))
  );

  // Estimate average hold time (simplified - based on buy/sell pairs)
  // This is a rough estimate without full position tracking
  const avgHoldTimeMinutes = 60 * 4; // Default to 4 hours if we can't calculate

  return {
    avgHoldTimeMinutes,
    tradeFrequencyPerDay,
    avgPositionSizeUsd,
    preferredTradingHours,
    totalTrades30d: transactions.length,
    uniqueTokensTraded: uniqueTokens.size,
  };
}

function calculatePerformance(transactions: WalletTransaction[]) {
  if (transactions.length === 0) {
    return {
      winRate: 0,
      totalPnl30d: 0,
      avgPnlPerTrade: 0,
      bestTradePnl: 0,
      worstTradePnl: 0,
      sharpeRatio: 0,
      maxDrawdown: 0,
      profitFactor: 1,
    };
  }

  // Simplified PnL calculation based on balance changes
  // In reality, you'd need to track positions more carefully
  const pnls: number[] = [];
  let totalPnl = 0;
  let grossProfit = 0;
  let grossLoss = 0;

  // Group by token and calculate simple PnL based on net balance changes
  const tokenFlows = new Map<string, number>();

  transactions.forEach((tx) => {
    tx.balanceChange.forEach((bc) => {
      // Positive amount = received, negative = sent
      const existing = tokenFlows.get(bc.address) || 0;
      tokenFlows.set(bc.address, existing + bc.amount);
    });
  });

  // Calculate realized PnL per token (simplified)
  tokenFlows.forEach((netFlow, tokenAddress) => {
    // Skip SOL (native token) for PnL calculation
    if (tokenAddress === "So11111111111111111111111111111111111111112") {
      return;
    }
    
    // Net flow represents approximate PnL
    // Positive = net gain, negative = net loss
    const pnl = netFlow;
    pnls.push(pnl);
    totalPnl += pnl;

    if (pnl > 0) {
      grossProfit += pnl;
    } else {
      grossLoss += Math.abs(pnl);
    }
  });

  const winningTrades = pnls.filter((p) => p > 0).length;
  const winRate = pnls.length > 0 ? winningTrades / pnls.length : 0;
  const avgPnlPerTrade = pnls.length > 0 ? totalPnl / pnls.length : 0;
  const bestTradePnl = pnls.length > 0 ? Math.max(...pnls) : 0;
  const worstTradePnl = pnls.length > 0 ? Math.min(...pnls) : 0;

  // Simplified Sharpe ratio calculation
  const avgReturn = pnls.length > 0 ? totalPnl / pnls.length : 0;
  const stdDev =
    pnls.length > 1
      ? Math.sqrt(
          pnls.reduce((sum, p) => sum + Math.pow(p - avgReturn, 2), 0) /
            (pnls.length - 1)
        )
      : 1;
  const sharpeRatio = stdDev > 0 ? avgReturn / stdDev : 0;

  // Profit factor
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 10 : 1;

  // Max drawdown (simplified)
  let maxDrawdown = 0;
  let peak = 0;
  let running = 0;

  pnls.forEach((pnl) => {
    running += pnl;
    if (running > peak) {
      peak = running;
    }
    const drawdown = peak > 0 ? (peak - running) / peak : 0;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  });

  return {
    winRate,
    totalPnl30d: totalPnl,
    avgPnlPerTrade,
    bestTradePnl,
    worstTradePnl,
    sharpeRatio,
    maxDrawdown,
    profitFactor,
  };
}

async function determinePreferences(transactions: WalletTransaction[]) {
  // Simplified - would need token data to properly categorize
  return {
    preferredMcap: "small" as const,
    topSectors: ["meme", "defi"],
    newTokenRate: 0.3,
    avgTokenAgeAtEntry: 48,
  };
}

function calculateRiskProfile(
  totalPortfolioUsd: number,
  portfolioItems: WalletToken[],
  transactions: WalletTransaction[]
) {
  // Calculate concentration
  const totalValue = totalPortfolioUsd || 1;
  const topPosition = portfolioItems.length > 0
    ? Math.max(...portfolioItems.map((t) => t.valueUsd || 0))
    : 0;
  const concentrationScore = topPosition / totalValue;

  // Average position as percentage of portfolio based on balance changes
  const avgPosition =
    transactions.length > 0
      ? transactions.reduce((sum, tx) => {
          const txValue = tx.balanceChange.reduce(
            (s, bc) => s + Math.abs(bc.amount),
            0
          );
          return sum + txValue;
        }, 0) /
        transactions.length /
        totalValue
      : 0;

  return {
    concentrationScore: Math.min(1, concentrationScore),
    avgPositionPct: Math.min(1, avgPosition) * 100,
    usesStopLoss: false, // Would need more data to determine
    recoveryTimeAvg: 24, // hours - placeholder
  };
}

function calculateRecentActivity(
  last24hTxs: WalletTransaction[],
  portfolioItems: WalletToken[]
) {
  const tokensEntered: string[] = [];
  const tokensExited: string[] = [];
  let netFlow = 0;

  last24hTxs.forEach((tx) => {
    tx.balanceChange.forEach((bc) => {
      if (bc.amount > 0) {
        // Received tokens
        tokensEntered.push(bc.symbol);
        netFlow += bc.amount;
      } else {
        // Sent tokens
        tokensExited.push(bc.symbol);
        netFlow += bc.amount; // amount is already negative
      }
    });
  });

  return {
    trades24h: last24hTxs.length,
    netFlow24h: netFlow,
    tokensEntered24h: [...new Set(tokensEntered)],
    tokensExited24h: [...new Set(tokensExited)],
    currentPositions: portfolioItems.filter((t) => t.valueUsd > 10).length,
  };
}

/**
 * Generate a simplified summary for LLM context
 */
export function generateFeatureSummary(
  features: WalletFeatures
): WalletFeatureSummary {
  // Determine trader type
  let traderType: WalletFeatureSummary["traderType"];
  if (features.trading.avgHoldTimeMinutes < 60) {
    traderType = "scalper";
  } else if (features.trading.avgHoldTimeMinutes < 24 * 60) {
    traderType = "swing";
  } else if (features.trading.avgHoldTimeMinutes < 7 * 24 * 60) {
    traderType = "position";
  } else {
    traderType = "mixed";
  }

  // Performance grade
  let performanceGrade: WalletFeatureSummary["performanceGrade"];
  const { winRate, profitFactor } = features.performance;
  if (winRate > 0.6 && profitFactor > 2) {
    performanceGrade = "A";
  } else if (winRate > 0.5 && profitFactor > 1.5) {
    performanceGrade = "B";
  } else if (winRate > 0.4 && profitFactor > 1) {
    performanceGrade = "C";
  } else if (winRate > 0.3) {
    performanceGrade = "D";
  } else {
    performanceGrade = "F";
  }

  // Risk level
  let riskLevel: WalletFeatureSummary["riskLevel"];
  if (features.risk.concentrationScore > 0.8 || features.risk.avgPositionPct > 50) {
    riskLevel = "extreme";
  } else if (features.risk.concentrationScore > 0.5 || features.risk.avgPositionPct > 30) {
    riskLevel = "high";
  } else if (features.risk.concentrationScore > 0.3 || features.risk.avgPositionPct > 15) {
    riskLevel = "medium";
  } else {
    riskLevel = "low";
  }

  // Strengths and weaknesses
  const strengths: string[] = [];
  const weaknesses: string[] = [];

  if (winRate > 0.55) strengths.push("High win rate");
  if (profitFactor > 1.5) strengths.push("Good profit factor");
  if (features.trading.tradeFrequencyPerDay > 5) strengths.push("Active trader");
  if (features.risk.concentrationScore < 0.3) strengths.push("Well diversified");

  if (winRate < 0.45) weaknesses.push("Low win rate");
  if (profitFactor < 1) weaknesses.push("Poor risk/reward");
  if (features.performance.maxDrawdown > 0.3) weaknesses.push("High drawdown");
  if (features.risk.concentrationScore > 0.6) weaknesses.push("Over-concentrated");

  // Recent trend
  let recentTrend: WalletFeatureSummary["recentTrend"];
  if (features.recentActivity.netFlow24h > 1000) {
    recentTrend = "improving";
  } else if (features.recentActivity.netFlow24h < -1000) {
    recentTrend = "declining";
  } else {
    recentTrend = "stable";
  }

  return {
    walletAddress: features.walletAddress,
    traderType,
    performanceGrade,
    riskLevel,
    winRate: features.performance.winRate,
    totalPnl30d: features.performance.totalPnl30d,
    avgTradesPerDay: features.trading.tradeFrequencyPerDay,
    topStrength: strengths[0] || "Consistent trading",
    topWeakness: weaknesses[0] || "Limited track record",
    recentTrend,
  };
}
