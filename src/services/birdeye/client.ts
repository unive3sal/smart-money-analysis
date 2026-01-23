import {
  BirdeyeResponse,
  TopTrader,
  TraderListResponse,
  WalletPortfolioResponse,
  WalletTransactionResponse,
  TokenInfo,
  PriceHistoryResponse,
  TokenTradesResponse,
} from "./types";

const BIRDEYE_API_BASE = "https://public-api.birdeye.so";

class BirdeyeClient {
  private apiKey: string;
  private cache: Map<string, { data: unknown; expiry: number }> = new Map();
  private cacheTTL = 60 * 1000; // 1 minute cache

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async fetch<T>(
    endpoint: string,
    params: Record<string, string | number> = {}
  ): Promise<T> {
    const cacheKey = `${endpoint}:${JSON.stringify(params)}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && cached.expiry > Date.now()) {
      return cached.data as T;
    }

    const url = new URL(`${BIRDEYE_API_BASE}${endpoint}`);
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, String(value));
    });

    const response = await fetch(url.toString(), {
      headers: {
        "X-API-KEY": this.apiKey,
        "x-chain": "solana",
      },
    });

    if (!response.ok) {
      throw new Error(`Birdeye API error: ${response.status} ${response.statusText}`);
    }

    const json: BirdeyeResponse<T> = await response.json();
    
    if (!json.success) {
      throw new Error("Birdeye API returned unsuccessful response");
    }

    this.cache.set(cacheKey, { data: json.data, expiry: Date.now() + this.cacheTTL });
    return json.data;
  }

  /**
   * Get top traders by PnL
   */
  async getTopTraders(
    timeframe: "24h" | "7d" | "30d" = "24h",
    limit: number = 20
  ): Promise<TopTrader[]> {
    // Using trader/gainers-losers endpoint
    const data = await this.fetch<TraderListResponse>("/trader/gainers-losers", {
      type: "gainer",
      sort_by: "PnL",
      sort_type: "desc",
      offset: 0,
      limit,
      time_frame: timeframe,
    });
    return data.items;
  }

  /**
   * Get wallet portfolio (token holdings)
   */
  async getWalletPortfolio(walletAddress: string): Promise<WalletPortfolioResponse> {
    return this.fetch<WalletPortfolioResponse>("/v1/wallet/token_list", {
      wallet: walletAddress,
    });
  }

  /**
   * Get wallet transaction history
   */
  async getWalletTransactions(
    walletAddress: string,
    limit: number = 50
  ): Promise<WalletTransactionResponse> {
    return this.fetch<WalletTransactionResponse>("/v1/wallet/tx_list", {
      wallet: walletAddress,
      limit,
    });
  }

  /**
   * Get token information
   */
  async getTokenInfo(tokenAddress: string): Promise<TokenInfo> {
    return this.fetch<TokenInfo>("/defi/token_overview", {
      address: tokenAddress,
    });
  }

  /**
   * Get token price history (for TimesNet training)
   */
  async getTokenPriceHistory(
    tokenAddress: string,
    timeframe: "1m" | "5m" | "15m" | "1H" | "4H" | "1D" = "1H",
    timeFrom?: number,
    timeTo?: number
  ): Promise<PriceHistoryResponse> {
    const params: Record<string, string | number> = {
      address: tokenAddress,
      type: timeframe,
    };

    if (timeFrom) params.time_from = timeFrom;
    if (timeTo) params.time_to = timeTo;

    return this.fetch<PriceHistoryResponse>("/defi/history_price", params);
  }

  /**
   * Get recent trades for a token
   */
  async getTokenTrades(
    tokenAddress: string,
    limit: number = 50
  ): Promise<TokenTradesResponse> {
    return this.fetch<TokenTradesResponse>("/defi/txs/token", {
      address: tokenAddress,
      limit,
      sort_type: "desc",
    });
  }

  /**
   * Get trending tokens
   */
  async getTrendingTokens(limit: number = 20): Promise<TokenInfo[]> {
    const data = await this.fetch<{ items: TokenInfo[] }>("/defi/token_trending", {
      sort_by: "rank",
      sort_type: "asc",
      offset: 0,
      limit,
    });
    return data.items;
  }

  /**
   * Search for token by symbol or name
   */
  async searchToken(query: string): Promise<TokenInfo[]> {
    const data = await this.fetch<{ items: TokenInfo[] }>("/defi/v2/tokens/search", {
      keyword: query,
      limit: 10,
    });
    return data.items;
  }
}

// Singleton instance
let birdeyeClient: BirdeyeClient | null = null;

export function getBirdeyeClient(): BirdeyeClient {
  if (!birdeyeClient) {
    const apiKey = process.env.BIRDEYE_API_KEY;
    if (!apiKey) {
      throw new Error("BIRDEYE_API_KEY environment variable is not set");
    }
    birdeyeClient = new BirdeyeClient(apiKey);
  }
  return birdeyeClient;
}

export { BirdeyeClient };
