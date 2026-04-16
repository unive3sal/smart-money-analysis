/**
 * Media sentiment data from Twitter/X and other platforms
 */
export interface MediaSentiment {
  tokenSymbol: string;
  tokenAddress?: string;
  
  // Mention metrics
  mentions1h: number;
  mentions24h: number;
  mentionChange24h: number; // % change
  
  // Sentiment analysis
  sentimentScore: number; // -1 to 1
  sentimentLabel: "very_negative" | "negative" | "neutral" | "positive" | "very_positive";
  
  // Influencer data
  topInfluencersMentioned: string[];
  influencerSentiment: number; // Weighted by follower count
  
  // Trending
  trendingRank: number | null;
  trendingMomentum: "rising" | "stable" | "falling";
  
  // Timestamps
  lastUpdated: number;
}

/**
 * Aggregated social metrics for a token
 */
export interface SocialMetrics {
  tokenAddress: string;
  
  // Twitter/X
  twitterMentions24h: number;
  twitterSentiment: number;
  twitterEngagement: number;
  
  // Optional additional sources
  telegramMembers?: number;
  discordMembers?: number;
  
  // Computed
  socialScore: number; // 0-100
  viralPotential: "low" | "medium" | "high";
}

/**
 * News/announcement data
 */
export interface NewsItem {
  title: string;
  source: string;
  url: string;
  publishedAt: number;
  sentiment: number;
  relevanceScore: number;
  tokens: string[];
}
