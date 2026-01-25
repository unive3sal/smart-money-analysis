import { MediaSentiment, SocialMetrics } from "./types";

/**
 * Media Intelligence Service
 * 
 * Uses free alternatives to gather social sentiment:
 * - LunarCrush (free tier)
 * - DexScreener social links
 * - Public sentiment APIs
 */

const LUNARCRUSH_API = "https://lunarcrush.com/api4/public";

interface LunarCrushResponse {
  data: {
    symbol: string;
    social_volume: number;
    social_volume_24h: number;
    sentiment: number;
    galaxy_score: number;
    alt_rank: number;
    social_contributors: number;
    social_dominance: number;
  }[];
}

/**
 * Fetch sentiment from LunarCrush
 * Note: LunarCrush API now requires authentication. 
 * For hackathon MVP, we return placeholder data if no API key is available.
 */
export async function fetchLunarCrushSentiment(
  symbol: string
): Promise<MediaSentiment | null> {
  const apiKey = process.env.LUNARCRUSH_API_KEY;
  
  // If no API key, skip LunarCrush and return null (will use fallback)
  if (!apiKey) {
    return null;
  }
  
  try {
    const response = await fetch(
      `${LUNARCRUSH_API}/coins/${symbol.toLowerCase()}/time-series/v2`,
      {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
      }
    );

    if (!response.ok) {
      // Don't log error for expected 401 when no key
      if (response.status !== 401) {
        console.warn(`LunarCrush API error for ${symbol}: ${response.status}`);
      }
      return null;
    }

    const data = await response.json();
    
    // Transform LunarCrush data to our format
    if (data?.data?.[0]) {
      const item = data.data[0];
      const sentimentScore = (item.sentiment - 50) / 50; // Normalize to -1 to 1
      
      return {
        tokenSymbol: symbol,
        mentions1h: Math.floor(item.social_volume / 24),
        mentions24h: item.social_volume_24h || item.social_volume,
        mentionChange24h: 0, // Would need historical data
        sentimentScore,
        sentimentLabel: getSentimentLabel(sentimentScore),
        topInfluencersMentioned: [],
        influencerSentiment: sentimentScore,
        trendingRank: item.alt_rank || null,
        trendingMomentum: "stable",
        lastUpdated: Date.now(),
      };
    }

    return null;
  } catch (error) {
    console.error("LunarCrush fetch error:", error);
    return null;
  }
}

/**
 * Get sentiment from DexScreener boosted tokens
 */
export async function fetchDexScreenerSocial(
  tokenAddress: string
): Promise<Partial<SocialMetrics> | null> {
  try {
    const response = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const pair = data.pairs?.[0];

    if (!pair) return null;

    // DexScreener doesn't provide direct sentiment, but we can infer from metrics
    const socialScore = calculateSocialScore({
      txns24h: pair.txns?.h24?.buys + pair.txns?.h24?.sells || 0,
      volume24h: pair.volume?.h24 || 0,
      priceChange24h: pair.priceChange?.h24 || 0,
      liquidity: pair.liquidity?.usd || 0,
    });

    return {
      tokenAddress,
      socialScore,
      viralPotential: socialScore > 70 ? "high" : socialScore > 40 ? "medium" : "low",
    };
  } catch (error) {
    console.error("DexScreener fetch error:", error);
    return null;
  }
}

/**
 * Aggregate sentiment from multiple sources
 */
export async function getMediaSentiment(
  tokenSymbol: string,
  tokenAddress?: string
): Promise<MediaSentiment> {
  // Try multiple sources in parallel
  const [lunarCrush, dexScreener] = await Promise.all([
    fetchLunarCrushSentiment(tokenSymbol).catch(() => null),
    tokenAddress ? fetchDexScreenerSocial(tokenAddress).catch(() => null) : null,
  ]);

  // Use LunarCrush if available
  if (lunarCrush) {
    return lunarCrush;
  }

  // If we have DexScreener data, use it to generate sentiment
  if (dexScreener?.socialScore !== undefined) {
    const normalizedScore = (dexScreener.socialScore - 50) / 50; // Normalize to -1 to 1
    return {
      tokenSymbol,
      tokenAddress,
      mentions1h: 0,
      mentions24h: 0,
      mentionChange24h: 0,
      sentimentScore: normalizedScore,
      sentimentLabel: getSentimentLabel(normalizedScore),
      topInfluencersMentioned: [],
      influencerSentiment: normalizedScore,
      trendingRank: null,
      trendingMomentum: dexScreener.viralPotential === "high" ? "rising" : "stable",
      lastUpdated: Date.now(),
    };
  }

  // Generate neutral placeholder sentiment (no external data available)
  return {
    tokenSymbol,
    tokenAddress,
    mentions1h: 0,
    mentions24h: 0,
    mentionChange24h: 0,
    sentimentScore: 0,
    sentimentLabel: "neutral",
    topInfluencersMentioned: [],
    influencerSentiment: 0,
    trendingRank: null,
    trendingMomentum: "stable",
    lastUpdated: Date.now(),
  };
}

/**
 * Calculate social score from trading metrics
 */
function calculateSocialScore(metrics: {
  txns24h: number;
  volume24h: number;
  priceChange24h: number;
  liquidity: number;
}): number {
  let score = 50; // Base score

  // Transaction activity
  if (metrics.txns24h > 1000) score += 15;
  else if (metrics.txns24h > 500) score += 10;
  else if (metrics.txns24h > 100) score += 5;

  // Volume
  if (metrics.volume24h > 1_000_000) score += 15;
  else if (metrics.volume24h > 100_000) score += 10;
  else if (metrics.volume24h > 10_000) score += 5;

  // Price momentum
  if (metrics.priceChange24h > 50) score += 10;
  else if (metrics.priceChange24h > 20) score += 5;
  else if (metrics.priceChange24h < -30) score -= 10;

  // Liquidity
  if (metrics.liquidity > 500_000) score += 10;
  else if (metrics.liquidity > 100_000) score += 5;
  else if (metrics.liquidity < 10_000) score -= 10;

  return Math.max(0, Math.min(100, score));
}

/**
 * Convert sentiment score to label
 */
function getSentimentLabel(
  score: number
): MediaSentiment["sentimentLabel"] {
  if (score > 0.5) return "very_positive";
  if (score > 0.2) return "positive";
  if (score > -0.2) return "neutral";
  if (score > -0.5) return "negative";
  return "very_negative";
}

/**
 * Check if a token is trending based on social metrics
 */
export function isTrending(sentiment: MediaSentiment): boolean {
  return (
    sentiment.mentions24h > 100 &&
    sentiment.sentimentScore > 0 &&
    (sentiment.trendingRank !== null && sentiment.trendingRank < 100)
  );
}
