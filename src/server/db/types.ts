export const WalletChain = {
  EVM: "EVM",
  SOLANA: "SOLANA",
} as const;

export type WalletChain = (typeof WalletChain)[keyof typeof WalletChain];

export const WalletProvider = {
  METAMASK: "METAMASK",
  PHANTOM: "PHANTOM",
} as const;

export type WalletProvider = (typeof WalletProvider)[keyof typeof WalletProvider];

export const WalletAuthType = {
  SIGNED_MESSAGE: "SIGNED_MESSAGE",
  API_KEY: "API_KEY",
  VAULT_DELEGATION: "VAULT_DELEGATION",
} as const;

export type WalletAuthType = (typeof WalletAuthType)[keyof typeof WalletAuthType];

export const TaskStatus = {
  ACTIVE: "ACTIVE",
  PAUSED: "PAUSED",
  STOPPED: "STOPPED",
  FAILED: "FAILED",
  COMPLETED: "COMPLETED",
} as const;

export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus];

export const ExecutionStatus = {
  PENDING: "PENDING",
  SUBMITTED: "SUBMITTED",
  FILLED: "FILLED",
  PARTIAL: "PARTIAL",
  CANCELLED: "CANCELLED",
  REJECTED: "REJECTED",
  FAILED: "FAILED",
} as const;

export type ExecutionStatus = (typeof ExecutionStatus)[keyof typeof ExecutionStatus];

export const AnalysisSignal = {
  STRONG_BUY: "STRONG_BUY",
  BUY: "BUY",
  HOLD: "HOLD",
  SELL: "SELL",
  STRONG_SELL: "STRONG_SELL",
  AVOID: "AVOID",
} as const;

export type AnalysisSignal = (typeof AnalysisSignal)[keyof typeof AnalysisSignal];

export const PositionSide = {
  BUY: "BUY",
  SELL: "SELL",
} as const;

export type PositionSide = (typeof PositionSide)[keyof typeof PositionSide];

export interface UserRecord {
  id: string;
  primaryAddress: string | null;
  displayName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WalletConnectionRecord {
  id: string;
  userId: string;
  address: string;
  chain: WalletChain;
  provider: WalletProvider;
  authType: WalletAuthType;
  label: string | null;
  isActive: boolean;
  authorizationScope: string | null;
  lastVerifiedAt: string | null;
  metadataJson: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TradingVaultRecord {
  id: string;
  userId: string;
  walletConnectionId: string | null;
  chain: WalletChain;
  address: string;
  funderAddress: string | null;
  label: string;
  authType: WalletAuthType;
  status: string;
  metadataJson: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CopyTradeTaskRecord {
  id: string;
  userId: string;
  walletConnectionId: string | null;
  tradingVaultId: string | null;
  traderAddress: string;
  traderChain: WalletChain;
  status: TaskStatus;
  name: string;
  allocationUsd: number;
  maxSlippageBps: number;
  takeProfitPercent: number | null;
  stopLossPercent: number | null;
  autoStopAfterTakeProfit: boolean;
  autoStopAfterStopLoss: boolean;
  timesnetEnabled: boolean;
  timesnetMinimumConfidence: number;
  timesnetRequiredSignal: AnalysisSignal | null;
  notes: string | null;
  lastProcessedCursor: string | null;
  lastAutoStopReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CopyTradePositionRecord {
  id: string;
  taskId: string;
  marketId: string;
  tokenId: string;
  side: PositionSide;
  shares: number;
  averageEntryPrice: number;
  currentPrice: number;
  realizedPnl: number;
  unrealizedPnl: number;
  status: string;
  openedAt: string;
  closedAt: string | null;
}

export interface CopyTradeExecutionRecord {
  id: string;
  taskId: string;
  marketId: string;
  tokenId: string;
  traderActivityEventId: string | null;
  side: PositionSide;
  status: ExecutionStatus;
  orderType: string;
  price: number;
  size: number;
  executedPrice: number | null;
  transactionHash: string | null;
  rejectionReason: string | null;
  metadataJson: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LeaderboardSnapshotRecord {
  id: string;
  address: string;
  displayName: string | null;
  rank: number;
  realizedPnl: number;
  unrealizedPnl: number;
  winRate: number;
  totalTrades: number;
  activityScore: number;
  capturedAt: string;
}

export interface MarketAnalysisSnapshotRecord {
  id: string;
  marketId: string;
  tokenId: string;
  question: string;
  currentPrice: number;
  priceHistoryJson: string;
  timesnetSummary: string;
  timesnetSignal: AnalysisSignal;
  timesnetConfidence: number;
  analysisJson: string | null;
  capturedAt: string;
  updatedAt: string;
}

export interface CopytradeDatabase {
  users: UserRecord[];
  walletConnections: WalletConnectionRecord[];
  tradingVaults: TradingVaultRecord[];
  copyTradeTasks: CopyTradeTaskRecord[];
  copyTradePositions: CopyTradePositionRecord[];
  copyTradeExecutions: CopyTradeExecutionRecord[];
  leaderboardSnapshots: LeaderboardSnapshotRecord[];
  marketAnalysisSnapshots: MarketAnalysisSnapshotRecord[];
}
