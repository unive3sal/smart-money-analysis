export interface WalletPolymarketAuthStatus {
  state: "unauthorized" | "authorized" | "requires_reauth";
  walletAddress: string;
  chain: string;
  provider: string;
  hasCachedCredentials: boolean;
  credentialsExpireAt: string | null;
  lastDerivedAt: string | null;
  reauthMessage: string | null;
  requestedAt: string | null;
}

export interface PolymarketMarket {
  marketId: string;
  tokenId: string;
  conditionId?: string;
  slug: string;
  question: string;
  description?: string;
  outcomes: string[];
  active: boolean;
  closed: boolean;
  endDate?: string;
  image?: string;
  volume24h: number;
  liquidity: number;
  lastPrice: number;
  bestBid: number;
  bestAsk: number;
  spread: number;
  priceChange24h: number;
  tickSize: string;
  negRisk: boolean;
  tags: string[];
}

export interface PolymarketTrader {
  address: string;
  displayName: string;
  avatarUrl?: string;
  realizedPnl: number;
  unrealizedPnl: number;
  winRate: number;
  totalTrades: number;
  activityScore: number;
  copiedByTasks: number;
}

export interface PolymarketTraderActivity {
  id: string;
  traderAddress: string;
  marketId: string;
  tokenId: string;
  side: "BUY" | "SELL";
  outcome: string;
  price: number;
  size: number;
  transactionHash?: string;
  timestamp: string;
  question: string;
}

export interface PolymarketMarketAnalysis {
  marketId: string;
  tokenId: string;
  question: string;
  currentPrice: number;
  summary: string;
  signal: "strong_buy" | "buy" | "hold" | "sell" | "strong_sell" | "avoid";
  confidence: number;
  recommendedAction: string;
  priceHistory: number[];
  analysisDetails?: Record<string, unknown>;
}

export interface BrokeredExecutionPreparePayload {
  executionId: string;
  taskId: string;
  marketId: string;
  tokenId: string;
  side: "BUY" | "SELL";
  price: number;
  size: number;
  orderType: string;
  walletAddress: string;
  funderAddress: string | null;
  expiresAt: string | null;
  metadata: Record<string, unknown>;
}

export interface BrokeredExecutionView {
  id: string;
  taskId: string;
  status: string;
  marketId: string;
  tokenId: string;
  side: "BUY" | "SELL";
  orderType: string;
  price: number;
  size: number;
  executedPrice: number | null;
  transactionHash: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown> | null;
  preparePayload: BrokeredExecutionPreparePayload | null;
}

export interface CopyTradeTaskView {
  id: string;
  name: string;
  traderAddress: string;
  status: string;
  allocationUsd: number;
  takeProfitPercent: number | null;
  stopLossPercent: number | null;
  timesnetEnabled: boolean;
  timesnetMinimumConfidence: number;
  timesnetRequiredSignal: string | null;
  maxSlippageBps: number;
  realizedPnl: number;
  unrealizedPnl: number;
  winRate: number;
  totalPositions: number;
  openPositions: number;
  lastAutoStopReason: string | null;
  executionAuthorizationReason?: string | null;
  executionWalletState?: WalletPolymarketAuthStatus["state"] | null;
  updatedAt: string;
}
