// Birdeye API Response Types

export interface BirdeyeResponse<T> {
  success: boolean;
  data: T;
}

// Top Traders / Gainers & Losers
export interface TopTrader {
  address: string;
  pnl: number;
  pnlPercent: number;
  volume: number;
  tradeCount: number;
  winRate: number;
  tokens: string[];
}

export interface TraderListResponse {
  items: TopTrader[];
  total: number;
}

// Wallet Portfolio
export interface WalletToken {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  balance: number;
  uiAmount: number;
  valueUsd: number;
  priceUsd: number;
  icon?: string;
}

export interface WalletPortfolioResponse {
  wallet: string;
  totalUsd: number;
  items: WalletToken[];
}

// Wallet Transaction History
export interface WalletTransaction {
  txHash: string;
  blockTime: number;
  status: "success" | "failed";
  from: string;
  to: string;
  fee: number;
  mainAction: string;
  tokenTransfers: TokenTransfer[];
}

export interface TokenTransfer {
  fromAddress: string;
  toAddress: string;
  tokenAddress: string;
  symbol: string;
  amount: number;
  amountUsd: number;
}

export interface WalletTransactionResponse {
  items: WalletTransaction[];
  hasNext: boolean;
}

// Token Info
export interface TokenInfo {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
  price: number;
  priceChange24h: number;
  volume24h: number;
  marketCap: number;
  holder: number;
  supply: number;
}

// Token Price History (for TimesNet)
export interface PriceHistoryPoint {
  unixTime: number;
  value: number;
  volume?: number;
}

export interface PriceHistoryResponse {
  items: PriceHistoryPoint[];
}

// Trading History for a specific token
export interface TokenTrade {
  txHash: string;
  blockTime: number;
  side: "buy" | "sell";
  tokenAddress: string;
  tokenSymbol: string;
  tokenAmount: number;
  nativeAmount: number;
  priceUsd: number;
  volumeUsd: number;
  wallet: string;
}

export interface TokenTradesResponse {
  items: TokenTrade[];
  hasNext: boolean;
}
