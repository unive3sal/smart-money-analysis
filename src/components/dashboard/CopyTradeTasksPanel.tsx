"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Play, Pause, Square, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { formatAddress, formatCurrency, formatPercent } from "@/lib/utils";

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
}

interface WalletOption {
  id: string;
  address: string;
  provider: string;
  chain: string;
}

interface Props {
  wallets: WalletOption[];
}

const seededTraders = [
  { label: "Election Whale", address: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063" },
  { label: "Macro Oracle", address: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174" },
  { label: "News Catalyst", address: "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E" },
];

export function CopyTradeTasksPanel({ wallets }: Props) {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedWalletId, setSelectedWalletId] = useState("");
  const [selectedTrader, setSelectedTrader] = useState(seededTraders[0].address);
  const [allocationUsd, setAllocationUsd] = useState("250");
  const [takeProfitPercent, setTakeProfitPercent] = useState("12");
  const [stopLossPercent, setStopLossPercent] = useState("8");
  const [error, setError] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);

  const selectedWallet = useMemo(
    () => wallets.find((wallet) => wallet.id === selectedWalletId) || wallets[0],
    [wallets, selectedWalletId]
  );

  async function loadTasks() {
    try {
      setLoading(true);
      const response = await fetch("/api/copytrade/tasks", { cache: "no-store" });
      const payload = await response.json();

      if (!response.ok) {
        setTasks([]);
        return;
      }

      setTasks(payload.data);
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

    try {
      setSubmitting(true);
      setError(null);
      const trader = seededTraders.find((item) => item.address === selectedTrader);
      const response = await fetch("/api/copytrade/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletConnectionId: selectedWallet.id,
          traderAddress: selectedTrader,
          name: `${trader?.label || "Trader"} mirror`,
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
                  <div className="text-sm font-medium">Source trader</div>
                  <Select value={selectedTrader} onValueChange={setSelectedTrader}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select trader" />
                    </SelectTrigger>
                    <SelectContent>
                      {seededTraders.map((trader) => (
                        <SelectItem key={trader.address} value={trader.address}>
                          {trader.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium">Wallet</div>
                  <Select value={selectedWalletId} onValueChange={setSelectedWalletId}>
                    <SelectTrigger>
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
                  <div className="text-sm font-medium">Allocation</div>
                  <Input value={allocationUsd} onChange={(e) => setAllocationUsd(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <div className="text-sm font-medium">TP %</div>
                    <Input value={takeProfitPercent} onChange={(e) => setTakeProfitPercent(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <div className="text-sm font-medium">SL %</div>
                    <Input value={stopLossPercent} onChange={(e) => setStopLossPercent(e.target.value)} />
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
                      <Button variant="destructive" size="sm" onClick={() => deleteTask(task.id)}>
                        <Trash2 className="mr-1 h-3.5 w-3.5" />
                        Delete
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
