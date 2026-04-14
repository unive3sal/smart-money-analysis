/**
 * Confidence score for trading signals
 */
export interface ConfidenceScore {
  // Overall score
  score: number; // 0-100
  
  // Signal classification
  signal: "strong_buy" | "buy" | "hold" | "sell" | "strong_sell" | "avoid";
  
  // Component scores
  components: {
    marketActivityScore: number; // 0-100
    mediaScore: number; // 0-100
    technicalScore: number; // 0-100 (from TimesNet if available)
    riskScore: number; // 0-100 (higher = lower risk)
  };
  
  // Reasoning for LLM explanation
  reasoning: string[];
  
  // Confidence in the confidence score itself
  reliability: "low" | "medium" | "high";
  
  // Warnings
  warnings: string[];
  
  // Metadata
  calculatedAt: number;
  dataAge: number; // seconds since last data update
}

/**
 * Input for confidence calculation
 */
export interface ConfidenceInput {
  // Market activity heuristics
  marketActivity: {
    netFlow24h: number;
    uniqueBuyers: number;
    uniqueSellers: number;
    dominantSide: "buy" | "sell" | "hold";
    avgWinRate: number;
    recentPnl: number;
  };
  
  // Media sentiment
  media?: {
    sentimentScore: number;
    mentions24h: number;
    trendingRank: number | null;
  };
  
  // Technical prediction (TimesNet)
  technical?: {
    predictedChange24h: number;
    confidence: number;
  };
  
  // Token fundamentals
  token: {
    marketCap: number;
    volume24h: number;
    liquidity: number;
    ageHours: number;
    holderCount: number;
  };
}
