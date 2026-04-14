import { ToolDefinition } from "../providers/openaiProxy";

/**
 * Tool definitions for the smart money agent
 */

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
          description: "Optional token identifier for more accurate data",
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
      "Calculate a confidence score for a potential trade using market data, media sentiment, and heuristic risk factors.",
    parameters: {
      type: "object",
      properties: {
        tokenSymbol: {
          type: "string",
          description: "Token symbol or market pair, for example 'SOL' or 'SOL/USDT'",
        },
      },
      required: ["tokenSymbol"],
    },
  },
};

export const getTokenInfoTool: ToolDefinition = {
  type: "function",
  function: {
    name: "get_token_info",
    description:
      "Get exchange market information for a token symbol or market pair using CCXT, including price, 24h change, and volume.",
    parameters: {
      type: "object",
      properties: {
        tokenSymbol: {
          type: "string",
          description: "Token symbol or market pair, for example 'SOL' or 'SOL/USDT'",
        },
      },
      required: ["tokenSymbol"],
    },
  },
};

export const getTimesNetForecastTool: ToolDefinition = {
  type: "function",
  function: {
    name: "get_timesnet_forecast",
    description:
      "Get advisory price forecast from an external TimesNet service using CCXT-backed price history.",
    parameters: {
      type: "object",
      properties: {
        tokenSymbol: {
          type: "string",
          description: "Token symbol or market pair (e.g., 'SOL' or 'SOL/USDT')",
        },
      },
      required: ["tokenSymbol"],
    },
  },
};

export const getTimesNetAnomalyTool: ToolDefinition = {
  type: "function",
  function: {
    name: "get_timesnet_anomaly",
    description:
      "Detect advisory anomalies in token price behavior using external TimesNet analysis over CCXT-backed price history.",
    parameters: {
      type: "object",
      properties: {
        tokenSymbol: {
          type: "string",
          description: "Token symbol or market pair (e.g., 'SOL' or 'SOL/USDT')",
        },
      },
      required: ["tokenSymbol"],
    },
  },
};

export const getTimesNetAnalysisTool: ToolDefinition = {
  type: "function",
  function: {
    name: "get_timesnet_analysis",
    description:
      "Get combined advisory analysis from an external TimesNet service using CCXT-backed price history.",
    parameters: {
      type: "object",
      properties: {
        tokenSymbol: {
          type: "string",
          description: "Token symbol or market pair (e.g., 'SOL' or 'SOL/USDT')",
        },
      },
      required: ["tokenSymbol"],
    },
  },
};

export const getWalletStatusTool: ToolDefinition = {
  type: "function",
  function: {
    name: "get_wallet_status",
    description: "Get authorized wallets and vault readiness for the current copy-trading user session.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
};

export const getPolymarketMarketInfoTool: ToolDefinition = {
  type: "function",
  function: {
    name: "get_polymarket_market_info",
    description: "Get Polymarket market information including price, liquidity, spread, and tags.",
    parameters: {
      type: "object",
      properties: {
        marketId: {
          type: "string",
          description: "Polymarket market id, slug, or token id",
        },
      },
      required: ["marketId"],
    },
  },
};

export const getPolymarketMarketAnalysisTool: ToolDefinition = {
  type: "function",
  function: {
    name: "get_polymarket_market_analysis",
    description: "Get TimesNet-filtered AI analysis for a Polymarket market.",
    parameters: {
      type: "object",
      properties: {
        marketId: {
          type: "string",
          description: "Polymarket market id, slug, or token id",
        },
      },
      required: ["marketId"],
    },
  },
};

export const getTopPolymarketTradersTool: ToolDefinition = {
  type: "function",
  function: {
    name: "get_top_polymarket_traders",
    description: "Get the top Polymarket traders ranked by recent performance and activity.",
    parameters: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Maximum number of traders to return",
        },
      },
    },
  },
};

export const getTraderActivityTool: ToolDefinition = {
  type: "function",
  function: {
    name: "get_trader_activity",
    description: "Get recent realtime-style trader activity for a Polymarket address.",
    parameters: {
      type: "object",
      properties: {
        address: {
          type: "string",
          description: "Trader wallet address",
        },
      },
      required: ["address"],
    },
  },
};

export const createCopyTradeTaskTool: ToolDefinition = {
  type: "function",
  function: {
    name: "create_copy_trade_task",
    description: "Create a copy-trade task for a trader with allocation, stop-loss, take-profit, and TimesNet filters.",
    parameters: {
      type: "object",
      properties: {
        walletConnectionId: {
          type: "string",
          description: "Authorized wallet connection id",
        },
        traderAddress: {
          type: "string",
          description: "Trader wallet address to follow",
        },
        name: {
          type: "string",
          description: "Display name for the task",
        },
        allocationUsd: {
          type: "number",
          description: "Task allocation in USDC/USD units",
        },
        takeProfitPercent: {
          type: "number",
          description: "Take-profit percent that can auto-stop the task",
        },
        stopLossPercent: {
          type: "number",
          description: "Stop-loss percent that can auto-stop the task",
        },
        timesnetMinimumConfidence: {
          type: "number",
          description: "Minimum TimesNet confidence threshold between 0 and 1",
        },
      },
      required: ["walletConnectionId", "traderAddress", "name", "allocationUsd"],
    },
  },
};

export const getCopyTradeTasksTool: ToolDefinition = {
  type: "function",
  function: {
    name: "get_copy_trade_tasks",
    description: "List copy-trade tasks for the current user session.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
};

export const getCopyTradeTaskTool: ToolDefinition = {
  type: "function",
  function: {
    name: "get_copy_trade_task",
    description: "Get task details, performance, and recent execution history for a specific copy-trade task.",
    parameters: {
      type: "object",
      properties: {
        taskId: {
          type: "string",
          description: "Copy-trade task id",
        },
      },
      required: ["taskId"],
    },
  },
};

export const pauseCopyTradeTaskTool: ToolDefinition = {
  type: "function",
  function: {
    name: "pause_copy_trade_task",
    description: "Pause an active copy-trade task.",
    parameters: {
      type: "object",
      properties: {
        taskId: {
          type: "string",
          description: "Copy-trade task id",
        },
      },
      required: ["taskId"],
    },
  },
};

export const resumeCopyTradeTaskTool: ToolDefinition = {
  type: "function",
  function: {
    name: "resume_copy_trade_task",
    description: "Resume a paused copy-trade task.",
    parameters: {
      type: "object",
      properties: {
        taskId: {
          type: "string",
          description: "Copy-trade task id",
        },
      },
      required: ["taskId"],
    },
  },
};

export const stopCopyTradeTaskTool: ToolDefinition = {
  type: "function",
  function: {
    name: "stop_copy_trade_task",
    description: "Stop a copy-trade task and record the reason.",
    parameters: {
      type: "object",
      properties: {
        taskId: {
          type: "string",
          description: "Copy-trade task id",
        },
        reason: {
          type: "string",
          description: "Optional stop reason",
        },
      },
      required: ["taskId"],
    },
  },
};

export const deleteCopyTradeTaskTool: ToolDefinition = {
  type: "function",
  function: {
    name: "delete_copy_trade_task",
    description: "Delete a copy-trade task.",
    parameters: {
      type: "object",
      properties: {
        taskId: {
          type: "string",
          description: "Copy-trade task id",
        },
      },
      required: ["taskId"],
    },
  },
};

export const ALL_TOOLS: ToolDefinition[] = [
  getWalletStatusTool,
  getPolymarketMarketInfoTool,
  getPolymarketMarketAnalysisTool,
  getTopPolymarketTradersTool,
  getTraderActivityTool,
  createCopyTradeTaskTool,
  getCopyTradeTasksTool,
  getCopyTradeTaskTool,
  pauseCopyTradeTaskTool,
  resumeCopyTradeTaskTool,
  stopCopyTradeTaskTool,
  deleteCopyTradeTaskTool,
  getMediaSentimentTool,
  getConfidenceScoreTool,
  getTokenInfoTool,
  getTimesNetForecastTool,
  getTimesNetAnomalyTool,
  getTimesNetAnalysisTool,
];
