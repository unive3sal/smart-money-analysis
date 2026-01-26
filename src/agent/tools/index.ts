import { ToolDefinition } from "../providers/openaiProxy";

/**
 * Tool definitions for the smart money agent
 */

export const fetchTopTradersTool: ToolDefinition = {
  type: "function",
  function: {
    name: "fetch_top_traders",
    description:
      "Fetch the top performing traders (smart money) on Solana by PnL. Returns a list of wallet addresses with their performance metrics.",
    parameters: {
      type: "object",
      properties: {
        timeframe: {
          type: "string",
          enum: ["30m", "1h", "2h", "4h", "6h", "8h", "24h"],
          description: "Time period for PnL calculation (max 24h). Note: 12h is not supported on Solana.",
        },
        limit: {
          type: "number",
          description: "Number of top traders to return (max 10)",
        },
      },
      required: [],
    },
  },
};

export const analyzeWalletTool: ToolDefinition = {
  type: "function",
  function: {
    name: "analyze_wallet",
    description:
      "Get detailed analysis of a specific wallet including holdings, recent transactions, and trading patterns.",
    parameters: {
      type: "object",
      properties: {
        walletAddress: {
          type: "string",
          description: "The Solana wallet address to analyze",
        },
      },
      required: ["walletAddress"],
    },
  },
};

export const getExtractedFeaturesTool: ToolDefinition = {
  type: "function",
  function: {
    name: "get_extracted_features",
    description:
      "Get structured feature extraction for a wallet including trading behavior, performance metrics, risk profile, and recent activity. Use this instead of raw data for concise analysis.",
    parameters: {
      type: "object",
      properties: {
        walletAddress: {
          type: "string",
          description: "The Solana wallet address",
        },
      },
      required: ["walletAddress"],
    },
  },
};

export const getMediaSentimentTool: ToolDefinition = {
  type: "function",
  function: {
    name: "get_media_sentiment",
    description:
      "Get social media sentiment and mentions for a token. Includes Twitter/X sentiment, trending status, and influencer mentions.",
    parameters: {
      type: "object",
      properties: {
        tokenSymbol: {
          type: "string",
          description: "Token symbol (e.g., 'SOL', 'BONK')",
        },
        tokenAddress: {
          type: "string",
          description: "Optional: Token contract address for more accurate data",
        },
      },
      required: ["tokenSymbol"],
    },
  },
};

export const getConfidenceScoreTool: ToolDefinition = {
  type: "function",
  function: {
    name: "get_confidence_score",
    description:
      "Calculate a confidence score for a potential trade based on smart money activity, media sentiment, and risk factors. Returns a signal (buy/sell/hold) with reasoning.",
    parameters: {
      type: "object",
      properties: {
        tokenAddress: {
          type: "string",
          description: "Token contract address",
        },
        tokenSymbol: {
          type: "string",
          description: "Token symbol",
        },
      },
      required: ["tokenAddress"],
    },
  },
};

export const getTokenInfoTool: ToolDefinition = {
  type: "function",
  function: {
    name: "get_token_info",
    description:
      "Get detailed information about a token including price, market cap, volume, and holder count.",
    parameters: {
      type: "object",
      properties: {
        tokenAddress: {
          type: "string",
          description: "Token contract address",
        },
      },
      required: ["tokenAddress"],
    },
  },
};

export const searchTokenTool: ToolDefinition = {
  type: "function",
  function: {
    name: "search_token",
    description:
      "Search for a token by name or symbol. Returns matching tokens with their addresses.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Token name or symbol to search for",
        },
      },
      required: ["query"],
    },
  },
};

export const getTrendingTokensTool: ToolDefinition = {
  type: "function",
  function: {
    name: "get_trending_tokens",
    description:
      "Get currently trending tokens on Solana based on volume and social activity.",
    parameters: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Number of trending tokens to return (max 20)",
        },
      },
      required: [],
    },
  },
};

// Export all tools as an array
export const ALL_TOOLS: ToolDefinition[] = [
  fetchTopTradersTool,
  analyzeWalletTool,
  getExtractedFeaturesTool,
  getMediaSentimentTool,
  getConfidenceScoreTool,
  getTokenInfoTool,
  searchTokenTool,
  getTrendingTokensTool,
];
