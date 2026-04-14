import { ConfidenceScore, ConfidenceInput } from "./types";

/**
 * Calculate confidence score for a trading signal
 */
export function calculateConfidence(input: ConfidenceInput): ConfidenceScore {
  const reasoning: string[] = [];
  const warnings: string[] = [];

  // 1. Market activity score (40% weight)
  const marketActivityScore = calculateMarketActivityScore(input.marketActivity, reasoning, warnings);

  // 2. Media Score (20% weight)
  const mediaScore = input.media
    ? calculateMediaScore(input.media, reasoning, warnings)
    : 50; // Neutral if no media data

  // 3. Technical Score (20% weight)
  const technicalScore = input.technical
    ? calculateTechnicalScore(input.technical, reasoning)
    : 50; // Neutral if no technical data

  // 4. Risk Score (20% weight)
  const riskScore = calculateRiskScore(input.token, reasoning, warnings);

  // Calculate weighted overall score
  const weights = {
    marketActivity: 0.4,
    media: 0.2,
    technical: 0.2,
    risk: 0.2,
  };

  const overallScore =
    marketActivityScore * weights.marketActivity +
    mediaScore * weights.media +
    technicalScore * weights.technical +
    riskScore * weights.risk;

  // Determine signal
  const signal = getSignalFromScore(overallScore, input);

  // Determine reliability
  const reliability = getReliability(input, warnings);

  return {
    score: Math.round(overallScore),
    signal,
    components: {
      marketActivityScore: Math.round(marketActivityScore),
      mediaScore: Math.round(mediaScore),
      technicalScore: Math.round(technicalScore),
      riskScore: Math.round(riskScore),
    },
    reasoning,
    reliability,
    warnings,
    calculatedAt: Date.now(),
    dataAge: 0, // Would be set based on actual data freshness
  };
}

function calculateMarketActivityScore(
  data: ConfidenceInput["marketActivity"],
  reasoning: string[],
  warnings: string[]
): number {
  let score = 50; // Base

  // Net flow analysis
  if (data.netFlow24h > 100000) {
    score += 20;
    reasoning.push(`Strong market activity inflow: $${(data.netFlow24h / 1000).toFixed(0)}K`);
  } else if (data.netFlow24h > 10000) {
    score += 10;
    reasoning.push(`Moderate market activity inflow: $${(data.netFlow24h / 1000).toFixed(0)}K`);
  } else if (data.netFlow24h < -100000) {
    score -= 20;
    reasoning.push(`Strong market activity outflow: $${(Math.abs(data.netFlow24h) / 1000).toFixed(0)}K`);
    warnings.push("Market activity is skewing bearish");
  } else if (data.netFlow24h < -10000) {
    score -= 10;
    reasoning.push(`Moderate market activity outflow`);
  }

  // Buyer/seller ratio
  const buyerRatio = data.uniqueBuyers / (data.uniqueBuyers + data.uniqueSellers + 1);
  if (buyerRatio > 0.7) {
    score += 15;
    reasoning.push(`High buyer ratio: ${(buyerRatio * 100).toFixed(0)}% of observed activity is buying`);
  } else if (buyerRatio < 0.3) {
    score -= 15;
    reasoning.push(`Low buyer ratio: Only ${(buyerRatio * 100).toFixed(0)}% of observed activity is buying`);
  }

  // Dominant side
  if (data.dominantSide === "buy") {
    score += 10;
    reasoning.push("Observed market activity is net buying");
  } else if (data.dominantSide === "sell") {
    score -= 10;
    reasoning.push("Observed market activity is net selling");
    warnings.push("Selling pressure is elevated");
  }

  // Win rate of participating wallets
  if (data.avgWinRate > 0.6) {
    score += 10;
    reasoning.push(`High win-rate activity proxy (${(data.avgWinRate * 100).toFixed(0)}%)`);
  } else if (data.avgWinRate < 0.4) {
    score -= 5;
    warnings.push("Observed activity quality looks weak");
  }

  return Math.max(0, Math.min(100, score));
}

function calculateMediaScore(
  data: NonNullable<ConfidenceInput["media"]>,
  reasoning: string[],
  warnings: string[]
): number {
  let score = 50;

  // Sentiment analysis
  if (data.sentimentScore > 0.5) {
    score += 20;
    reasoning.push("Very positive social sentiment");
  } else if (data.sentimentScore > 0.2) {
    score += 10;
    reasoning.push("Positive social sentiment");
  } else if (data.sentimentScore < -0.5) {
    score -= 20;
    reasoning.push("Very negative social sentiment");
    warnings.push("Strong negative sentiment on social media");
  } else if (data.sentimentScore < -0.2) {
    score -= 10;
    reasoning.push("Negative social sentiment");
  }

  // Mention volume
  if (data.mentions24h > 1000) {
    score += 10;
    reasoning.push(`High social activity: ${data.mentions24h} mentions in 24h`);
  } else if (data.mentions24h < 10) {
    score -= 5;
    reasoning.push("Low social visibility");
  }

  // Trending status
  if (data.trendingRank !== null && data.trendingRank < 50) {
    score += 10;
    reasoning.push(`Trending #${data.trendingRank}`);
  }

  // Check for potential hype cycle (high mentions + positive sentiment)
  if (data.mentions24h > 500 && data.sentimentScore > 0.3) {
    warnings.push("High hype - verify fundamentals before entering");
  }

  return Math.max(0, Math.min(100, score));
}

function calculateTechnicalScore(
  data: NonNullable<ConfidenceInput["technical"]>,
  reasoning: string[]
): number {
  let score = 50;

  // Predicted price change
  if (data.predictedChange24h > 20) {
    score += 25;
    reasoning.push(`TimesNet predicts +${data.predictedChange24h.toFixed(1)}% in 24h`);
  } else if (data.predictedChange24h > 5) {
    score += 15;
    reasoning.push(`TimesNet predicts moderate upside: +${data.predictedChange24h.toFixed(1)}%`);
  } else if (data.predictedChange24h < -20) {
    score -= 25;
    reasoning.push(`TimesNet predicts ${data.predictedChange24h.toFixed(1)}% decline`);
  } else if (data.predictedChange24h < -5) {
    score -= 15;
    reasoning.push(`TimesNet predicts moderate downside: ${data.predictedChange24h.toFixed(1)}%`);
  }

  // Adjust by model confidence
  const confidenceMultiplier = 0.5 + data.confidence * 0.5;
  score = 50 + (score - 50) * confidenceMultiplier;

  return Math.max(0, Math.min(100, score));
}

function calculateRiskScore(
  token: ConfidenceInput["token"],
  reasoning: string[],
  warnings: string[]
): number {
  let score = 50; // Higher = lower risk

  // Market cap assessment
  if (token.marketCap > 100_000_000) {
    score += 15;
    reasoning.push("Large market cap provides stability");
  } else if (token.marketCap < 1_000_000) {
    score -= 15;
    warnings.push("Micro-cap token - high volatility risk");
  } else if (token.marketCap < 10_000_000) {
    score -= 5;
    reasoning.push("Small market cap - moderate volatility expected");
  }

  // Liquidity assessment
  const liquidityRatio = token.liquidity / token.marketCap;
  if (liquidityRatio > 0.1) {
    score += 10;
    reasoning.push("Good liquidity depth");
  } else if (liquidityRatio < 0.02) {
    score -= 15;
    warnings.push("Low liquidity - difficult to exit large positions");
  }

  // Volume analysis
  const volumeToMcap = token.volume24h / token.marketCap;
  if (volumeToMcap > 0.5) {
    score += 5;
    reasoning.push("Healthy trading volume");
  } else if (volumeToMcap < 0.05) {
    score -= 10;
    warnings.push("Low trading volume");
  }

  // Token age
  if (token.ageHours < 24) {
    score -= 20;
    warnings.push("Very new token (<24h) - extreme risk");
  } else if (token.ageHours < 168) {
    score -= 10;
    warnings.push("New token (<7 days) - elevated risk");
  } else if (token.ageHours > 720) {
    score += 5;
    reasoning.push("Established token (30+ days)");
  }

  // Holder concentration
  if (token.holderCount < 100) {
    score -= 15;
    warnings.push("Few holders - whale manipulation risk");
  } else if (token.holderCount > 10000) {
    score += 10;
    reasoning.push("Well-distributed holder base");
  }

  return Math.max(0, Math.min(100, score));
}

function getSignalFromScore(
  score: number,
  input: ConfidenceInput
): ConfidenceScore["signal"] {
  // Check for red flags that override score
  if (input.token.liquidity < 5000) return "avoid";
  if (input.token.ageHours < 1) return "avoid";

  // Score-based signal
  if (score >= 80) return "strong_buy";
  if (score >= 65) return "buy";
  if (score >= 45) return "hold";
  if (score >= 30) return "sell";
  if (score >= 15) return "strong_sell";
  return "avoid";
}

function getReliability(
  input: ConfidenceInput,
  warnings: string[]
): ConfidenceScore["reliability"] {
  let reliabilityScore = 0;

  // Data availability
  if (input.media) reliabilityScore += 25;
  if (input.technical) reliabilityScore += 25;
  if (input.marketActivity.uniqueBuyers + input.marketActivity.uniqueSellers > 5) {
    reliabilityScore += 25;
  }
  if (input.token.holderCount > 1000) reliabilityScore += 25;

  // Penalty for warnings
  reliabilityScore -= warnings.length * 10;

  if (reliabilityScore >= 70) return "high";
  if (reliabilityScore >= 40) return "medium";
  return "low";
}

/**
 * Generate a human-readable summary
 */
export function generateConfidenceSummary(confidence: ConfidenceScore): string {
  const signalEmoji = {
    strong_buy: "++",
    buy: "+",
    hold: "=",
    sell: "-",
    strong_sell: "--",
    avoid: "X",
  };

  let summary = `Signal: ${signalEmoji[confidence.signal]} ${confidence.signal.toUpperCase()} (Score: ${confidence.score}/100)\n\n`;

  summary += "Analysis:\n";
  confidence.reasoning.forEach((reason) => {
    summary += `- ${reason}\n`;
  });

  if (confidence.warnings.length > 0) {
    summary += "\nWarnings:\n";
    confidence.warnings.forEach((warning) => {
      summary += `! ${warning}\n`;
    });
  }

  summary += `\nReliability: ${confidence.reliability}`;

  return summary;
}
