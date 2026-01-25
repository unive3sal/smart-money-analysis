// Birdeye API Response Types
// Based on actual API responses from birdeye.md

export interface BirdeyeResponse<T> {
  success: boolean;
  data: T;
}

// ============================================
// Top Traders for a Token
// Endpoint: /defi/v2/tokens/top_traders
// ============================================
export interface TopTrader {
  tokenAddress: string;
  owner: string;
  tags: string[];
  type: string;
  volume: number;
  trade: number;
  tradeBuy: number;
  tradeSell: number;
  volumeBuy: number;
  volumeSell: number;
  isScaledUiToken: boolean;
  multiplier: number | null;
}

export interface TraderListResponse {
  items: TopTrader[];
}

// ============================================
// Wallet Portfolio (Beta)
// Endpoint: /v1/wallet/token_list
// ============================================
export interface WalletToken {
  address: string;
  decimals: number;
  balance: number;
  uiAmount: number;
  chainId: string;
  name: string;
  symbol: string;
  icon?: string;
  logoURI?: string;
  priceUsd: number;
  valueUsd: number;
  isScaledUiToken: boolean;
  multiplier: number | null;
}

// Response is { items: WalletToken[] } directly
export interface WalletPortfolioResponse {
  items: WalletToken[];
}

// ============================================
// Wallet Transaction History
// Endpoint: /v1/wallet/tx_list
// ============================================
export interface BalanceChange {
  amount: number;
  symbol: string;
  name: string;
  decimals: number;
  address: string;
  logoURI?: string;
  isScaledUiToken: boolean;
  multiplier: number | null;
}

export interface TokenTransfer {
  fromTokenAccount: string;
  toTokenAccount: string;
  fromUserAccount: string;
  toUserAccount: string;
  tokenAmount: number;
  mint: string;
  transferNative?: boolean;
  isScaledUiToken: boolean;
  multiplier: number | null;
}

export interface ContractLabel {
  address: string;
  name: string;
  metadata: {
    icon: string;
  };
}

export interface WalletTransaction {
  txHash: string;
  blockNumber: number;
  blockTime: string; // ISO date string like "2025-03-24T15:06:14+00:00"
  status: boolean;
  from: string;
  to: string;
  fee: number;
  mainAction: string;
  balanceChange: BalanceChange[];
  contractLabel?: ContractLabel;
  tokenTransfers: TokenTransfer[];
}

// Response has chain name as key (e.g., "solana": [...])
export interface WalletTransactionResponse {
  solana: WalletTransaction[];
}

// ============================================
// Token Overview
// Endpoint: /defi/token_overview
// ============================================
export interface TokenExtensions {
  coingeckoId?: string;
  website?: string;
  telegram?: string | null;
  twitter?: string;
  description?: string;
  discord?: string;
  medium?: string;
}

export interface TokenInfo {
  address: string;
  decimals: number;
  symbol: string;
  name: string;
  marketCap: number;
  fdv: number;
  extensions?: TokenExtensions;
  logoURI?: string;
  liquidity: number;
  lastTradeUnixTime: number;
  lastTradeHumanTime: string;
  price: number;
  priceChange24hPercent: number;
  v24hUSD: number;
  holder: number;
  totalSupply: number;
  circulatingSupply: number;
  // Many more fields available but not all needed
}

// ============================================
// Price History
// Endpoint: /defi/history_price
// ============================================
export interface PriceHistoryPoint {
  unixTime: number;
  value: number;
}

export interface PriceHistoryResponse {
  isScaledUiToken: boolean;
  items: PriceHistoryPoint[];
}

// ============================================
// Token Trades
// Endpoint: /defi/txs/token/seek_by_time
// ============================================
export interface TokenAmount {
  symbol: string;
  decimals: number;
  address: string;
  amount: string;
  uiAmount: number;
  price: number;
  changeAmount: number;
  uiChangeAmount: number;
  isScaledUiToken: boolean;
  multiplier: number | null;
}

export interface TokenTrade {
  quote: TokenAmount;
  base: TokenAmount;
  basePrice: number;
  quotePrice: number;
  txHash: string;
  source: string;
  blockUnixTime: number;
  txType: string;
  owner: string;
  side: "buy" | "sell";
  alias: string | null;
  pricePair: number;
  from: TokenAmount;
  to: TokenAmount;
  tokenPrice: number;
  poolId: string;
}

export interface TokenTradesResponse {
  items: TokenTrade[];
  hasNext: boolean;
}

// ============================================
// Search - Token, market data
// Endpoint: /defi/v3/search
// ============================================
export interface SearchTokenResult {
  name: string;
  symbol: string;
  address: string;
  network: string;
  decimals: number;
  verified: boolean;
  fdv: number;
  market_cap: number;
  liquidity: number;
  price: number;
  price_change_24h_percent: number;
  volume_24h_usd: number;
  last_trade_unix_time: number;
  last_trade_human_time: string;
  is_scaled_ui_token: boolean;
  multiplier: number | null;
}

export interface SearchResultItem {
  type: "token" | "market";
  result: SearchTokenResult[];
}

export interface SearchResponse {
  items: SearchResultItem[];
}

// ============================================
// Token Trending
// Endpoint: /defi/token_trending
// ============================================
export interface TrendingToken {
  address: string;
  decimals: number;
  liquidity: number;
  logoURI?: string;
  name: string;
  symbol: string;
  volume24hUSD: number;
  rank: number;
}

export interface TrendingResponse {
  updateUnixTime: number;
  updateTime: string;
  tokens: TrendingToken[];
  total: number;
}
