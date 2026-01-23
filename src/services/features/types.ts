/**
 * Extracted features from smart wallet data
 * Used for both LLM analysis and TimesNet training
 */
export interface WalletFeatures {
  // Identification
  walletAddress: string;
  snapshotTimestamp: number;

  // Trading Behavior
  trading: {
    avgHoldTimeMinutes: number;
    tradeFrequencyPerDay: number;
    avgPositionSizeUsd: number;
    preferredTradingHours: number[]; // Hour buckets (0-23)
    totalTrades30d: number;
    uniqueTokensTraded: number;
  };

  // Performance Metrics
  performance: {
    winRate: number; // 0-1
    totalPnl30d: number; // USD
    avgPnlPerTrade: number;
    bestTradePnl: number;
    worstTradePnl: number;
    sharpeRatio: number;
    maxDrawdown: number; // 0-1
    profitFactor: number; // gross_profit / gross_loss
  };

  // Token Preferences
  preferences: {
    preferredMcap: "micro" | "small" | "mid" | "large";
    topSectors: string[]; // ['meme', 'defi', 'gaming']
    newTokenRate: number; // % of trades on tokens < 7 days old
    avgTokenAgeAtEntry: number; // hours
  };

  // Risk Profile
  risk: {
    concentrationScore: number; // 0-1 (1 = all in one token)
    avgPositionPct: number; // avg % of portfolio per trade
    usesStopLoss: boolean;
    recoveryTimeAvg: number; // hours to recover from loss
  };

  // Recent Activity (for real-time analysis)
  recentActivity: {
    trades24h: number;
    netFlow24h: number; // USD bought - sold
    tokensEntered24h: string[];
    tokensExited24h: string[];
    currentPositions: number;
  };
}

/**
 * Simplified feature summary for LLM context
 */
export interface WalletFeatureSummary {
  walletAddress: string;
  traderType: "scalper" | "swing" | "position" | "mixed";
  performanceGrade: "A" | "B" | "C" | "D" | "F";
  riskLevel: "low" | "medium" | "high" | "extreme";
  winRate: number;
  totalPnl30d: number;
  avgTradesPerDay: number;
  topStrength: string;
  topWeakness: string;
  recentTrend: "improving" | "stable" | "declining";
}

/**
 * TimesNet training data row
 */
export interface TimesNetDataRow {
  timestamp: number;
  tokenAddress: string;

  // Target variable
  priceChange24h: number;

  // Smart money aggregate features
  smNetFlow: number;
  smUniqueBuyers: number;
  smUniqueSellers: number;
  smAvgPositionSize: number;
  smTopWalletAction: -1 | 0 | 1; // sell/hold/buy

  // Token features
  tokenVolume24h: number;
  tokenMcap: number;
  tokenHolderCount: number;
  tokenAgeHours: number;

  // Optional: Media features (when available)
  twitterMentionCount?: number;
  twitterSentiment?: number;
  trendingScore?: number;
}
