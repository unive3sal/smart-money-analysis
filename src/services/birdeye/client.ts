import {
  BirdeyeResponse,
  TopTrader,
  TraderListResponse,
  WalletPortfolioResponse,
  WalletTransactionResponse,
  WalletTransaction,
  TokenInfo,
  PriceHistoryResponse,
  TokenTradesResponse,
  TrendingToken,
  TrendingResponse,
  SearchResponse,
  SearchTokenResult,
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

    console.log(`[Birdeye] Requesting: ${url.toString()}`);

    const response = await fetch(url.toString(), {
      headers: {
        "X-API-KEY": this.apiKey,
        "x-chain": "solana",
        "accept": "application/json",
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`[Birdeye] Error response: ${errorBody}`);
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
   * Get top traders for a specific token
   * Endpoint: /defi/v2/tokens/top_traders
   * Example: birdeye.md lines 1-27
   * Valid time_frame values: 30m, 1h, 2h, 4h, 6h, 8h, 24h
   * Note: 12h is NOT supported on Solana chain
   */
  async getTopTraders(
    tokenAddress: string = "So11111111111111111111111111111111111111112",
    timeframe: "30m" | "1h" | "2h" | "4h" | "6h" | "8h" | "24h" = "24h",
    limit: number = 10
  ): Promise<TopTrader[]> {
    const data = await this.fetch<TraderListResponse>("/defi/v2/tokens/top_traders", {
      address: tokenAddress,
      time_frame: timeframe,
      sort_type: "desc",
      sort_by: "volume",
      offset: 0,
      limit,
    });
    return data.items;
  }

  /**
   * Get wallet portfolio (token holdings)
   * Endpoint: /v1/wallet/token_list
   * Example: birdeye.md lines 29-87
   */
  async getWalletPortfolio(walletAddress: string): Promise<WalletPortfolioResponse> {
    return this.fetch<WalletPortfolioResponse>("/v1/wallet/token_list", {
      wallet: walletAddress,
    });
  }

  /**
   * Get wallet transaction history
   * Endpoint: /v1/wallet/tx_list
   * Example: birdeye.md lines 89-144
   * Note: Response has chain name as key (e.g., { solana: [...] })
   */
  async getWalletTransactions(
    walletAddress: string,
    limit: number = 100
  ): Promise<WalletTransaction[]> {
    const data = await this.fetch<WalletTransactionResponse>("/v1/wallet/tx_list", {
      wallet: walletAddress,
      limit,
    });
    return data.solana || [];
  }

  /**
   * Get token overview/information
   * Endpoint: /defi/token_overview
   * Example: birdeye.md lines 272-547
   */
  async getTokenInfo(tokenAddress: string): Promise<TokenInfo> {
    return this.fetch<TokenInfo>("/defi/token_overview", {
      address: tokenAddress,
    });
  }

  /**
   * Get token price history
   * Endpoint: /defi/history_price
   * Example: birdeye.md lines 166-192
   */
  async getTokenPriceHistory(
    tokenAddress: string,
    timeframe: "1m" | "5m" | "15m" | "1H" | "4H" | "1D" = "1m",
    timeFrom?: number,
    timeTo?: number
  ): Promise<PriceHistoryResponse> {
    const params: Record<string, string | number> = {
      address: tokenAddress,
      address_type: "token",
      type: timeframe,
    };

    if (timeFrom) params.time_from = timeFrom;
    if (timeTo) params.time_to = timeTo;

    return this.fetch<PriceHistoryResponse>("/defi/history_price", params);
  }

  /**
   * Get token trades (seek by time)
   * Endpoint: /defi/txs/token/seek_by_time
   * Example: birdeye.md lines 194-270
   */
  async getTokenTrades(
    tokenAddress: string,
    limit: number = 50
  ): Promise<TokenTradesResponse> {
    return this.fetch<TokenTradesResponse>("/defi/txs/token/seek_by_time", {
      address: tokenAddress,
      offset: 0,
      limit,
      tx_type: "swap",
    });
  }

  /**
   * Get trending tokens
   * Endpoint: /defi/token_trending
   */
  async getTrendingTokens(limit: number = 20): Promise<TrendingToken[]> {
    const data = await this.fetch<TrendingResponse>("/defi/token_trending", {
      sort_by: "rank",
      sort_type: "asc",
      offset: 0,
      limit,
    });
    return data.tokens;
  }

  /**
   * Search for token by symbol or name
   * Endpoint: /defi/v3/search
   * Example: birdeye.md lines 574-624
   */
  async searchToken(query: string): Promise<SearchTokenResult[]> {
    const data = await this.fetch<SearchResponse>("/defi/v3/search", {
      keyword: query,
      chain: "solana",
      target: "token",
      sort_by: "volume_24h_usd",
      sort_type: "desc",
      offset: 0,
      limit: 10,
    });
    
    // Extract token results from the nested structure
    const tokenItem = data.items.find(item => item.type === "token");
    return tokenItem?.result || [];
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
