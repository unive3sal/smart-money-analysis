"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Play, Pause, Square, Trash2, ShieldAlert } from "lucide-react";
import { buildBrowserBrokeredOrder } from "@/frontend/lib/polymarketExecution";
import { getBrowserEvmWalletClient } from "@/frontend/lib/evmWallet";
import { Button } from "@/frontend/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/frontend/components/ui/card";
import { Input } from "@/frontend/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/frontend/components/ui/select";
import { Badge } from "@/frontend/components/ui/badge";
import { formatAddress, formatCurrency, formatPercent } from "@/frontend/lib/utils";

interface TaskItem {
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
  executionWalletState?: "unauthorized" | "authorized" | "requires_reauth" | null;
  updatedAt: string;
  executions?: Array<{
    id: string;
    status: string;
    orderType: string;
    price: number;
    size: number;
    executedPrice: number | null;
    transactionHash: string | null;
    createdAt: string;
  }>;
  pendingExecutions?: Array<{
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
    preparePayload: {
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
    } | null;
  }>;
}

interface WalletOption {
  id: string;
  address: string;
  provider: "METAMASK" | "PHANTOM" | string;
  chain: string;
  polymarketAuth?: {
    state: "unauthorized" | "authorized" | "requires_reauth";
    credentialsExpireAt?: string | null;
  } | null;
}

interface TraderOption {
  address: string;
  displayName: string;
}

interface Props {
  wallets: WalletOption[];
}

export function CopyTradeTasksPanel({ wallets }: Props) {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [traders, setTraders] = useState<TraderOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedWalletId, setSelectedWalletId] = useState("");
  const [selectedTrader, setSelectedTrader] = useState("");
  const [allocationUsd, setAllocationUsd] = useState("250");
  const [takeProfitPercent, setTakeProfitPercent] = useState("12");
  const [stopLossPercent, setStopLossPercent] = useState("8");
  const [error, setError] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);
  const [confirmDeleteTaskId, setConfirmDeleteTaskId] = useState<string | null>(null);

  const selectedWallet = useMemo(
    () => wallets.find((wallet) => wallet.id === selectedWalletId) || wallets[0],
    [wallets, selectedWalletId]
  );
  const readyWalletCount = useMemo(
    () => wallets.filter((wallet) => wallet.polymarketAuth?.state === "authorized").length,
    [wallets]
  );
  const pendingExecutionCount = useMemo(
    () => tasks.reduce((sum, task) => sum + (task.pendingExecutions?.length || 0), 0),
    [tasks]
  );
  const blockedTaskCount = useMemo(
    () => tasks.filter((task) => task.executionAuthorizationReason).length,
    [tasks]
  );

  async function loadTasks() {
    try {
      setLoading(true);
      const [tasksResponse, tradersResponse] = await Promise.all([
        fetch("/api/copytrade/tasks", { cache: "no-store" }),
        fetch("/api/traders?limit=25", { cache: "no-store" }),
      ]);
      const [tasksPayload, tradersPayload] = await Promise.all([
        tasksResponse.json(),
        tradersResponse.json(),
      ]);

      if (!tasksResponse.ok) {
        setTasks([]);
      } else {
        setTasks(tasksPayload.data);
      }

      if (tradersResponse.ok) {
        const loadedTraders = ((tradersPayload.data || []) as TraderOption[])
          .map((trader) => ({
            address: trader.address,
            displayName: trader.displayName,
          }));
        setTraders(loadedTraders);
        setSelectedTrader((current) => current || loadedTraders[0]?.address || "");
      } else {
        setTraders([]);
        setSelectedTrader("");
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load tasks");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (wallets.length > 0 && !selectedWalletId) {
      setSelectedWalletId(wallets[0].id);
    }
  }, [wallets, selectedWalletId]);

  useEffect(() => {
    loadTasks();
  }, []);

  async function createTask() {
    if (!selectedWallet) {
      setError("Connect a wallet before creating a task.");
      return;
    }

    if (selectedWallet.chain !== "EVM") {
      setError("Polymarket copy trading currently requires an EVM wallet.");
      return;
    }

    if (selectedWallet.polymarketAuth?.state !== "authorized") {
      setError("Authorize Polymarket execution for the selected wallet before creating a task.");
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      const trader = traders.find((item) => item.address === selectedTrader);
      const response = await fetch("/api/copytrade/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletConnectionId: selectedWallet.id,
          traderAddress: selectedTrader,
          name: `${trader?.displayName || "Trader"} mirror`,
          allocationUsd: Number(allocationUsd),
          takeProfitPercent: Number(takeProfitPercent),
          stopLossPercent: Number(stopLossPercent),
          timesnetEnabled: true,
          timesnetMinimumConfidence: 0.6,
          maxSlippageBps: 125,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to create task");
      }
      await loadTasks();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create task");
    } finally {
      setSubmitting(false);
    }
  }

  async function postTaskAction(taskId: string, action: "pause" | "resume" | "stop") {
    await fetch(`/api/copytrade/tasks/${taskId}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: action === "stop" ? "Stopped from dashboard" : undefined }),
    });
    await loadTasks();
    if (selectedTask?.id === taskId) {
      await inspectTask(taskId);
    }
  }

  async function inspectTask(taskId: string) {
    const response = await fetch(`/api/copytrade/tasks/${taskId}`, { cache: "no-store" });
    const payload = await response.json();
    if (response.ok) {
      setSelectedTask(payload.data);
    }
  }

  async function deleteTask(taskId: string) {
    await fetch(`/api/copytrade/tasks/${taskId}`, { method: "DELETE" });
    if (selectedTask?.id === taskId) {
      setSelectedTask(null);
    }
    await loadTasks();
  }

  async function cancelExecution(executionId: string) {
    try {
      setError(null);
      const response = await fetch(`/api/copytrade/executions/${executionId}/cancel`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to cancel execution");
      }
      await loadTasks();
      if (selectedTask?.id) {
        await inspectTask(selectedTask.id);
      }
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : "Failed to cancel execution");
    }
  }

  async function submitExecution(executionId: string) {
    try {
      setError(null);
      const prepareResponse = await fetch(`/api/copytrade/executions/${executionId}/prepare`, { method: "POST" });
      const preparePayload = await prepareResponse.json();
      if (!prepareResponse.ok) {
        throw new Error(preparePayload.error || "Failed to prepare execution");
      }

      const execution = preparePayload.data.execution;
      const orderPayload = preparePayload.data.preparePayload;
      const taskWallet = wallets.find((wallet) => wallet.id === selectedWallet?.id || wallet.address.toLowerCase() === orderPayload.walletAddress.toLowerCase());
      if (!taskWallet || taskWallet.provider !== "METAMASK" && taskWallet.provider !== "PHANTOM") {
        throw new Error("A connected EVM browser wallet matching this execution is required.");
      }

      const credsResponse = await fetch(`/api/wallets/polymarket?walletConnectionId=${encodeURIComponent(taskWallet.id)}`, { cache: "no-store" });
      const credsPayload = await credsResponse.json();
      if (!credsResponse.ok) {
        throw new Error(credsPayload.error || "Failed to load wallet Polymarket authorization state");
      }
      if (credsPayload.data.state !== "authorized") {
        throw new Error("Polymarket execution must be authorized before signing orders.");
      }

      const walletClient = await getBrowserEvmWalletClient({
        provider: taskWallet.provider,
        expectedAddress: orderPayload.walletAddress,
      });

      const signedOrder = await buildBrowserBrokeredOrder({
        walletClient,
        preparePayload: orderPayload,
        creds: {
          key: "browser-placeholder",
          secret: "browser-placeholder",
          passphrase: "browser-placeholder",
        },
      });

      const submitResponse = await fetch(`/api/copytrade/executions/${executionId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signedOrder,
          orderId: execution.id,
          venueStatus: "submitted_from_browser",
          executedPrice: orderPayload.price,
        }),
      });
      const submitPayload = await submitResponse.json();
      if (!submitResponse.ok) {
        throw new Error(submitPayload.error || "Failed to submit execution");
      }

      await loadTasks();
      if (selectedTask?.id) {
        await inspectTask(selectedTask.id);
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to submit execution");
    }
  }

  return (
    <Card className="rounded-[30px] border-white/10 bg-white/[0.035] shadow-[0_24px_80px_rgba(0,0,0,0.24)]">
      <CardHeader className="border-b border-white/10 pb-5">
        <CardTitle>Copy trade task automation</CardTitle>
        <CardDescription>
          Create, pause, resume, stop, and inspect TimesNet-filtered Polymarket copytrade tasks.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
          <div className="space-y-6 rounded-[28px] border border-white/10 bg-white/[0.03] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.2)]">
            <div className="space-y-4">
              <div className="text-[0.7rem] font-semibold uppercase tracking-[0.28em] text-primary/80">Task launchpad</div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="copytrade-source-trader" className="text-sm font-medium">Source trader</label>
                  <Select value={selectedTrader} onValueChange={setSelectedTrader}>
                    <SelectTrigger id="copytrade-source-trader" aria-label="Source trader">
                      <SelectValue placeholder="Select trader" />
                    </SelectTrigger>
                    <SelectContent>
                      {traders.map((trader) => (
                        <SelectItem key={trader.address} value={trader.address}>
                          {trader.displayName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label htmlFor="copytrade-wallet" className="text-sm font-medium">Wallet</label>
                  <Select value={selectedWalletId} onValueChange={setSelectedWalletId}>
                    <SelectTrigger id="copytrade-wallet" aria-label="Execution wallet">
                      <SelectValue placeholder="Select wallet" />
                    </SelectTrigger>
                    <SelectContent>
                      {wallets.map((wallet) => (
                        <SelectItem key={wallet.id} value={wallet.id}>
                          {wallet.provider} · {wallet.chain}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label htmlFor="copytrade-allocation" className="text-sm font-medium">Allocation (USD)</label>
                  <Input
                    id="copytrade-allocation"
                    type="number"
                    inputMode="decimal"
                    min="1"
                    step="1"
                    value={allocationUsd}
                    onChange={(e) => setAllocationUsd(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label htmlFor="copytrade-tp" className="text-sm font-medium">TP %</label>
                    <Input
                      id="copytrade-tp"
                      type="number"
                      inputMode="decimal"
                      step="0.1"
                      value={takeProfitPercent}
                      onChange={(e) => setTakeProfitPercent(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="copytrade-sl" className="text-sm font-medium">SL %</label>
                    <Input
                      id="copytrade-sl"
                      type="number"
                      inputMode="decimal"
                      step="0.1"
                      value={stopLossPercent}
                      onChange={(e) => setStopLossPercent(e.target.value)}
                    />
                  </div>
                </div>
              </div>
              <Button className="w-full rounded-xl" onClick={createTask} disabled={submitting || wallets.length === 0}>
                {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Create task
              </Button>
            </div>

            <div className="rounded-2xl border border-primary/15 bg-primary/5 p-4 text-sm text-muted-foreground">
              Tasks bootstrap from the latest observed trader activity, then the worker advances them only when a new event arrives and passes the TimesNet filter.
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-background/70 p-4">
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-muted-foreground">
                  <ShieldAlert className="h-3.5 w-3.5 text-primary" />
                  Execution-ready wallets
                </div>
                <div className="mt-3 text-2xl font-semibold">{readyWalletCount}</div>
                <div className="mt-2 text-sm text-muted-foreground">Wallets currently authorized for Polymarket execution signing.</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-background/70 p-4">
                <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Pending signatures</div>
                <div className="mt-3 text-2xl font-semibold">{pendingExecutionCount}</div>
                <div className="mt-2 text-sm text-muted-foreground">Queued orders requiring browser confirmation before submission.</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-background/70 p-4">
                <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Execution blocked</div>
                <div className="mt-3 text-2xl font-semibold">{blockedTaskCount}</div>
                <div className="mt-2 text-sm text-muted-foreground">Tasks waiting on wallet or signing readiness before live submission.</div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-background/70 p-4">
                <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Active tasks</div>
                <div className="mt-3 text-2xl font-semibold">{tasks.filter((task) => task.status === "active").length}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-background/70 p-4">
                <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Open positions</div>
                <div className="mt-3 text-2xl font-semibold">{tasks.reduce((sum, task) => sum + task.openPositions, 0)}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-background/70 p-4">
                <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Realized PnL</div>
                <div className="mt-3 text-2xl font-semibold">{formatCurrency(tasks.reduce((sum, task) => sum + task.realizedPnl, 0))}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-background/70 p-4">
                <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Unrealized PnL</div>
                <div className="mt-3 text-2xl font-semibold">{formatCurrency(tasks.reduce((sum, task) => sum + task.unrealizedPnl, 0))}</div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[0.7rem] font-semibold uppercase tracking-[0.28em] text-primary/80">Active book</div>
                <div className="mt-1 text-sm text-muted-foreground">Inspect, pause, resume, and review current copytrade tasks.</div>
              </div>
              <Badge variant="outline" className="rounded-full border-white/10 px-3 py-1.5">
                {tasks.length} tracked
              </Badge>
            </div>

            {loading ? (
              <div className="flex items-center gap-2 rounded-2xl border border-dashed border-white/10 p-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading tasks...
              </div>
            ) : tasks.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 p-4 text-sm text-muted-foreground">
                No copytrade tasks yet. Create one above after authorizing a wallet.
              </div>
            ) : (
              tasks.map((task) => (
                <div key={task.id} className="space-y-4 rounded-[26px] border border-white/10 bg-white/[0.03] p-5 shadow-[0_16px_40px_rgba(0,0,0,0.18)]">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold">{task.name}</h3>
                        <Badge variant={task.status === "active" ? "default" : "secondary"}>{task.status}</Badge>
                        {selectedTask?.id === task.id ? <Badge variant="outline">Selected</Badge> : null}
                      </div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        Following {formatAddress(task.traderAddress, 6)} · Allocation {formatCurrency(task.allocationUsd)} · TimesNet ≥ {(task.timesnetMinimumConfidence * 100).toFixed(0)}%
                      </div>
                      {task.pendingExecutions?.length ? (
                        <div className="mt-2">
                          <Badge variant="outline">{task.pendingExecutions.length} pending execution{task.pendingExecutions.length === 1 ? "" : "s"}</Badge>
                        </div>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" className="border-white/10" onClick={() => inspectTask(task.id)}>
                        Inspect
                      </Button>
                      <Button variant="outline" size="sm" className="border-white/10" onClick={() => postTaskAction(task.id, task.status === "active" ? "pause" : "resume")}>
                        {task.status === "active" ? <Pause className="mr-1 h-3.5 w-3.5" /> : <Play className="mr-1 h-3.5 w-3.5" />}
                        {task.status === "active" ? "Pause" : "Resume"}
                      </Button>
                      <Button variant="outline" size="sm" className="border-white/10" onClick={() => postTaskAction(task.id, "stop")}>
                        <Square className="mr-1 h-3.5 w-3.5" />
                        Stop
                      </Button>
                      <Button
                        variant={confirmDeleteTaskId === task.id ? "destructive" : "outline"}
                        size="sm"
                        className={confirmDeleteTaskId === task.id ? "" : "border-white/10"}
                        onClick={() => {
                          if (confirmDeleteTaskId === task.id) {
                            void deleteTask(task.id);
                            setConfirmDeleteTaskId(null);
                            return;
                          }
                          setConfirmDeleteTaskId(task.id);
                        }}
                      >
                        <Trash2 className="mr-1 h-3.5 w-3.5" />
                        {confirmDeleteTaskId === task.id ? "Confirm delete" : "Delete"}
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-5">
                    <div className="rounded-2xl border border-white/10 bg-background/70 p-3">
                      <div className="text-xs text-muted-foreground">Realized PnL</div>
                      <div className="mt-1 font-semibold">{formatCurrency(task.realizedPnl)}</div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-background/70 p-3">
                      <div className="text-xs text-muted-foreground">Unrealized PnL</div>
                      <div className="mt-1 font-semibold">{formatCurrency(task.unrealizedPnl)}</div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-background/70 p-3">
                      <div className="text-xs text-muted-foreground">Win rate</div>
                      <div className="mt-1 font-semibold">{formatPercent(task.winRate)}</div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-background/70 p-3">
                      <div className="text-xs text-muted-foreground">Positions</div>
                      <div className="mt-1 font-semibold">{task.openPositions} / {task.totalPositions}</div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-background/70 p-3">
                      <div className="text-xs text-muted-foreground">Risk rails</div>
                      <div className="mt-1 font-semibold">TP {task.takeProfitPercent ?? "-"}% · SL {task.stopLossPercent ?? "-"}%</div>
                    </div>
                  </div>

                  {task.lastAutoStopReason && (
                    <div className="text-sm text-muted-foreground">
                      Last auto-stop reason: {task.lastAutoStopReason}
                    </div>
                  )}
                  {task.executionAuthorizationReason ? (
                    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
                      Execution blocked: {task.executionAuthorizationReason.replaceAll("_", " ")}
                    </div>
                  ) : null}
                  {confirmDeleteTaskId === task.id ? (
                    <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive-foreground">
                      Confirm deletion to remove this task from the automation book.
                    </div>
                  ) : null}
                </div>
              ))
            )}

            {selectedTask ? (
              <div className="space-y-4 rounded-[28px] border border-primary/15 bg-primary/5 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold">Task inspection</div>
                    <div className="text-sm text-muted-foreground">
                      {selectedTask.name} · {formatAddress(selectedTask.traderAddress, 6)}
                    </div>
                  </div>
                  <Badge variant="secondary">{selectedTask.executions?.length || 0} executions</Badge>
                </div>
                <div className="grid gap-3 md:grid-cols-4">
                  <div className="rounded-2xl border border-white/10 bg-background p-3">
                    <div className="text-xs text-muted-foreground">Realized</div>
                    <div className="mt-1 font-semibold">{formatCurrency(selectedTask.realizedPnl)}</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-background p-3">
                    <div className="text-xs text-muted-foreground">Unrealized</div>
                    <div className="mt-1 font-semibold">{formatCurrency(selectedTask.unrealizedPnl)}</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-background p-3">
                    <div className="text-xs text-muted-foreground">Win rate</div>
                    <div className="mt-1 font-semibold">{formatPercent(selectedTask.winRate)}</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-background p-3">
                    <div className="text-xs text-muted-foreground">TimesNet rule</div>
                    <div className="mt-1 font-semibold">{selectedTask.timesnetRequiredSignal || "buy"} @ {(selectedTask.timesnetMinimumConfidence * 100).toFixed(0)}%</div>
                  </div>
                </div>
                {selectedTask.executionAuthorizationReason ? (
                  <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
                    Execution blocked because {selectedTask.executionAuthorizationReason.replaceAll("_", " ")}.
                  </div>
                ) : null}
                <div className="space-y-2">
                  <div className="text-sm font-medium">Queued for signature</div>
                  {selectedTask.pendingExecutions?.length ? (
                    <div className="grid gap-2">
                      {selectedTask.pendingExecutions.map((execution) => (
                        <div key={execution.id} className="rounded-2xl border border-white/10 bg-background p-3 text-sm">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="font-medium">{execution.side} · {execution.orderType}</div>
                              <div className="text-muted-foreground">
                                {execution.size} shares @ {execution.price.toFixed(3)}
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {(execution.metadata?.question as string | undefined) || execution.marketId}
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Button size="sm" onClick={() => void submitExecution(execution.id)}>
                                Sign & execute
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => void cancelExecution(execution.id)}>
                                Cancel
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-white/10 p-4 text-sm text-muted-foreground">
                      No pending executions.
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium">Recent executions</div>
                  {selectedTask.executions?.length ? (
                    <div className="grid gap-2">
                      {selectedTask.executions.slice(0, 5).map((execution) => (
                        <div key={execution.id} className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-background p-3 text-sm">
                          <div>
                            <div className="font-medium">{execution.status} · {execution.orderType}</div>
                            <div className="text-muted-foreground">
                              {execution.size} shares @ {(execution.executedPrice ?? execution.price).toFixed(3)}
                            </div>
                          </div>
                          <div className="text-xs text-muted-foreground">{new Date(execution.createdAt).toLocaleString()}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-white/10 p-4 text-sm text-muted-foreground">
                      No executions recorded yet.
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {error && <div className="text-sm text-destructive">{error}</div>}
      </CardContent>
    </Card>
  );
}
