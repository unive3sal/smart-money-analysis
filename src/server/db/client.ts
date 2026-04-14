import fs from "node:fs";
import path from "node:path";
import { cookies } from "next/headers";
import {
  AnalysisSignal,
  ExecutionStatus,
  PositionSide,
  TaskStatus,
  WalletAuthType,
  WalletChain,
  WalletProvider,
  type CopytradeDatabase,
  type CopyTradeExecutionRecord,
  type CopyTradePositionRecord,
  type CopyTradeTaskRecord,
  type LeaderboardSnapshotRecord,
  type MarketAnalysisSnapshotRecord,
  type TradingVaultRecord,
  type UserRecord,
  type WalletConnectionRecord,
} from "@/server/db/types";

const DATA_DIR = path.join(process.cwd(), ".data");
const DATA_FILE = path.join(DATA_DIR, "copytrade-db.json");
const SESSION_COOKIE = "copytrade_session";

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(DATA_FILE)) {
    const initial: CopytradeDatabase = {
      users: [],
      walletConnections: [],
      tradingVaults: [],
      copyTradeTasks: [],
      copyTradePositions: [],
      copyTradeExecutions: [],
      leaderboardSnapshots: [],
      marketAnalysisSnapshots: [],
    };

    fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2));
  }
}

function readDb(): CopytradeDatabase {
  ensureDataFile();
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8")) as CopytradeDatabase;
}

function writeDb(data: CopytradeDatabase) {
  ensureDataFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function cuid(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

function nowIso() {
  return new Date().toISOString();
}

export interface TaskWithRelations extends CopyTradeTaskRecord {
  positions: CopyTradePositionRecord[];
  executions?: CopyTradeExecutionRecord[];
  walletConnection?: WalletConnectionRecord | null;
  tradingVault?: TradingVaultRecord | null;
}

class JsonDatabase {
  private load() {
    return readDb();
  }

  private save(data: CopytradeDatabase) {
    writeDb(data);
  }

  async findUserById(id: string): Promise<UserRecord | null> {
    return this.load().users.find((user) => user.id === id) || null;
  }

  async findUserByPrimaryAddress(primaryAddress: string): Promise<UserRecord | null> {
    return this.load().users.find((user) => user.primaryAddress === primaryAddress) || null;
  }

  async upsertUserByPrimaryAddress(input: {
    primaryAddress: string;
    displayName?: string;
  }): Promise<UserRecord> {
    const data = this.load();
    const existing = data.users.find((user) => user.primaryAddress === input.primaryAddress);

    if (existing) {
      existing.displayName = input.displayName ?? existing.displayName;
      existing.updatedAt = nowIso();
      this.save(data);
      return existing;
    }

    const created: UserRecord = {
      id: cuid("user"),
      primaryAddress: input.primaryAddress,
      displayName: input.displayName || null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };

    data.users.push(created);
    this.save(data);
    return created;
  }

  async listWalletConnections(userId: string): Promise<WalletConnectionRecord[]> {
    return this.load().walletConnections
      .filter((wallet) => wallet.userId === userId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async createWalletConnection(input: {
    userId: string;
    address: string;
    chain: WalletChain;
    provider: WalletProvider;
    authType: WalletAuthType;
    label?: string;
    authorizationScope?: string;
  }): Promise<WalletConnectionRecord> {
    const data = this.load();
    const record: WalletConnectionRecord = {
      id: cuid("wallet"),
      userId: input.userId,
      address: input.address,
      chain: input.chain,
      provider: input.provider,
      authType: input.authType,
      label: input.label || null,
      isActive: true,
      authorizationScope: input.authorizationScope || null,
      lastVerifiedAt: nowIso(),
      metadataJson: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    data.walletConnections.push(record);
    this.save(data);
    return record;
  }

  async updateWalletConnection(id: string, updates: Partial<WalletConnectionRecord>) {
    const data = this.load();
    const record = data.walletConnections.find((wallet) => wallet.id === id);
    if (!record) throw new Error("Wallet connection not found");
    Object.assign(record, updates, { updatedAt: nowIso() });
    this.save(data);
    return record;
  }

  async findWalletConnectionByComposite(address: string, chain: WalletChain, provider: WalletProvider) {
    return this.load().walletConnections.find(
      (wallet) => wallet.address === address && wallet.chain === chain && wallet.provider === provider
    ) || null;
  }

  async listTradingVaults(userId: string): Promise<TradingVaultRecord[]> {
    return this.load().tradingVaults
      .filter((vault) => vault.userId === userId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async findTradingVaultByAddress(userId: string, address: string, chain: WalletChain) {
    return this.load().tradingVaults.find(
      (vault) => vault.userId === userId && vault.address === address && vault.chain === chain
    ) || null;
  }

  async createTradingVault(input: {
    userId: string;
    walletConnectionId: string | null;
    chain: WalletChain;
    address: string;
    funderAddress?: string | null;
    label: string;
    authType: WalletAuthType;
    status?: string;
    metadataJson?: string | null;
  }): Promise<TradingVaultRecord> {
    const data = this.load();
    const record: TradingVaultRecord = {
      id: cuid("vault"),
      userId: input.userId,
      walletConnectionId: input.walletConnectionId,
      chain: input.chain,
      address: input.address,
      funderAddress: input.funderAddress ?? null,
      label: input.label,
      authType: input.authType,
      status: input.status ?? "authorized",
      metadataJson: input.metadataJson ?? null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    data.tradingVaults.push(record);
    this.save(data);
    return record;
  }

  async getCurrentUserWalletConnections(): Promise<WalletConnectionRecord[]> {
    const sessionId = cookies().get(SESSION_COOKIE)?.value;
    if (!sessionId) {
      return [];
    }
    return this.listWalletConnections(sessionId);
  }

  async getCurrentUserTradingVaults(): Promise<TradingVaultRecord[]> {
    const sessionId = cookies().get(SESSION_COOKIE)?.value;
    if (!sessionId) {
      return [];
    }
    return this.listTradingVaults(sessionId);
  }

  async listCopyTradeTasks(userId: string): Promise<TaskWithRelations[]> {
    const data = this.load();
    return data.copyTradeTasks
      .filter((task) => task.userId === userId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((task) => this.attachTaskRelations(task, data));
  }

  async findCopyTradeTask(taskId: string, userId: string): Promise<TaskWithRelations | null> {
    const data = this.load();
    const task = data.copyTradeTasks.find((item) => item.id === taskId && item.userId === userId);
    return task ? this.attachTaskRelations(task, data) : null;
  }

  async createCopyTradeTask(input: Omit<CopyTradeTaskRecord, "id" | "createdAt" | "updatedAt">) {
    const data = this.load();
    const task: CopyTradeTaskRecord = {
      ...input,
      id: cuid("task"),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    data.copyTradeTasks.push(task);
    this.save(data);
    return task;
  }

  async updateCopyTradeTask(taskId: string, updates: Partial<CopyTradeTaskRecord>) {
    const data = this.load();
    const task = data.copyTradeTasks.find((item) => item.id === taskId);
    if (!task) throw new Error("Copy trade task not found");
    Object.assign(task, updates, { updatedAt: nowIso() });
    this.save(data);
    return task;
  }

  async deleteCopyTradeTask(taskId: string, userId: string) {
    const data = this.load();
    data.copyTradeTasks = data.copyTradeTasks.filter((task) => !(task.id === taskId && task.userId === userId));
    data.copyTradePositions = data.copyTradePositions.filter((position) => position.taskId !== taskId);
    data.copyTradeExecutions = data.copyTradeExecutions.filter((execution) => execution.taskId !== taskId);
    this.save(data);
  }

  async createCopyTradePosition(input: Omit<CopyTradePositionRecord, "id" | "openedAt" | "closedAt"> & { closedAt?: string | null }) {
    const data = this.load();
    const position: CopyTradePositionRecord = {
      ...input,
      id: cuid("position"),
      openedAt: nowIso(),
      closedAt: input.closedAt ?? null,
    };
    data.copyTradePositions.push(position);
    this.save(data);
    return position;
  }

  async createCopyTradeExecution(input: Omit<CopyTradeExecutionRecord, "id" | "createdAt" | "updatedAt">) {
    const data = this.load();
    const execution: CopyTradeExecutionRecord = {
      ...input,
      id: cuid("execution"),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    data.copyTradeExecutions.push(execution);
    this.save(data);
    return execution;
  }

  async listActiveCopyTradeTasks(): Promise<TaskWithRelations[]> {
    const data = this.load();
    return data.copyTradeTasks
      .filter((task) => task.status === TaskStatus.ACTIVE)
      .map((task) => this.attachTaskRelations(task, data));
  }

  async listLeaderboardSnapshots(limit: number): Promise<LeaderboardSnapshotRecord[]> {
    return this.load().leaderboardSnapshots
      .sort((a, b) => a.rank - b.rank || b.capturedAt.localeCompare(a.capturedAt))
      .slice(0, limit);
  }

  async countLeaderboardSnapshots() {
    return this.load().leaderboardSnapshots.length;
  }

  async createLeaderboardSnapshots(records: Array<Omit<LeaderboardSnapshotRecord, "id" | "capturedAt">>) {
    const data = this.load();
    data.leaderboardSnapshots.push(
      ...records.map((record) => ({
        ...record,
        id: cuid("leaderboard"),
        capturedAt: nowIso(),
      }))
    );
    this.save(data);
  }

  async findMarketAnalysisSnapshot(marketId: string, tokenId: string): Promise<MarketAnalysisSnapshotRecord | null> {
    return this.load().marketAnalysisSnapshots.find(
      (snapshot) => snapshot.marketId === marketId && snapshot.tokenId === tokenId
    ) || null;
  }

  async upsertMarketAnalysisSnapshot(input: Omit<MarketAnalysisSnapshotRecord, "id" | "capturedAt" | "updatedAt">) {
    const data = this.load();
    const existing = data.marketAnalysisSnapshots.find(
      (snapshot) => snapshot.marketId === input.marketId && snapshot.tokenId === input.tokenId
    );

    if (existing) {
      Object.assign(existing, input, { updatedAt: nowIso() });
      this.save(data);
      return existing;
    }

    const snapshot: MarketAnalysisSnapshotRecord = {
      ...input,
      id: cuid("analysis"),
      capturedAt: nowIso(),
      updatedAt: nowIso(),
    };
    data.marketAnalysisSnapshots.push(snapshot);
    this.save(data);
    return snapshot;
  }

  private attachTaskRelations(task: CopyTradeTaskRecord, data: CopytradeDatabase): TaskWithRelations {
    return {
      ...task,
      positions: data.copyTradePositions.filter((position) => position.taskId === task.id),
      executions: data.copyTradeExecutions.filter((execution) => execution.taskId === task.id),
      walletConnection: data.walletConnections.find((wallet) => wallet.id === task.walletConnectionId) || null,
      tradingVault: data.tradingVaults.find((vault) => vault.id === task.tradingVaultId) || null,
    };
  }
}

export const db = new JsonDatabase();

export {
  AnalysisSignal,
  ExecutionStatus,
  PositionSide,
  TaskStatus,
  WalletAuthType,
  WalletChain,
  WalletProvider,
};
