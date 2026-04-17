"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  BrainCircuit,
  ShieldCheck,
  Trophy,
  Wallet,
  Waves,
  Workflow,
} from "lucide-react";
import { Badge } from "@/frontend/components/ui/badge";
import { ChatInterface } from "@/frontend/components/ChatInterface";
import { WalletPanel } from "@/frontend/components/wallet/WalletPanel";
import { CopyTradeTasksPanel } from "@/frontend/components/dashboard/CopyTradeTasksPanel";
import { TraderActivityPanel } from "@/frontend/components/dashboard/TraderActivityPanel";
import { MarketAnalysisPanel } from "@/frontend/components/dashboard/MarketAnalysisPanel";

interface WalletSummary {
  id: string;
  address: string;
  provider: string;
  chain: string;
  label: string | null;
  lastVerifiedAt: string | null;
  polymarketAuth: {
    state: "unauthorized" | "authorized" | "requires_reauth";
    walletAddress: string;
    chain: string;
    provider: string;
    hasCachedCredentials: boolean;
    credentialsExpireAt: string | null;
    lastDerivedAt: string | null;
    reauthMessage: string | null;
    requestedAt: string | null;
  } | null;
}

interface WalletState {
  user: {
    id: string;
    primaryAddress: string | null;
  };
  wallets: WalletSummary[];
  vaults: Array<{
    id: string;
    address: string;
    chain: string;
    label: string;
    status: string;
  }>;
}

interface ProviderOption {
  key: string;
  title: string;
  description: string;
  provider: "METAMASK" | "PHANTOM";
  chain: "EVM" | "SOLANA";
  mode: "browser";
}

interface TaskSnapshot {
  id: string;
  status: string;
  executionAuthorizationReason?: string | null;
  pendingExecutions?: Array<{ id: string }>;
}

type BrowserWalletAuthorization = {
  address: string;
  signature: string;
};

type DashboardView = "overview" | "automation" | "traders" | "markets" | "wallets" | "assistant";

const viewContent: Record<DashboardView, {
  eyebrow: string;
  title: string;
  description: string;
}> = {
  overview: {
    eyebrow: "Overview",
    title: "Operate the trading stack from a cleaner command center.",
    description: "Keep capital readiness, automation posture, and AI-guided decision support visible without forcing every panel onto one screen.",
  },
  automation: {
    eyebrow: "Automation",
    title: "Manage live copy-trade tasks and execution queues.",
    description: "Use the task book to launch strategies, review risk rails, and act on pending browser-signature requests.",
  },
  traders: {
    eyebrow: "Traders",
    title: "Watch high-signal traders before committing automation.",
    description: "Review leaderboard ranking and recent fills so task creation starts from observed behavior rather than guesswork.",
  },
  markets: {
    eyebrow: "Markets",
    title: "Validate execution opportunities against market and AI context.",
    description: "Keep TimesNet guidance close to liquidity, bid-ask, and market framing before task activity reaches execution.",
  },
  wallets: {
    eyebrow: "Wallets & access",
    title: "Control wallet authority, Polymarket auth, and vault visibility.",
    description: "Keep signing rails, EVM readiness, and provisioned vault paths explicit before automation requests live execution.",
  },
  assistant: {
    eyebrow: "Assistant",
    title: "Drive inspection and control through natural-language operations.",
    description: "Use the assistant as an operator console for reviewing traders, tasks, and market filters without leaving the workflow.",
  },
};

function isDashboardView(value: string | null): value is DashboardView {
  return value === "overview"
    || value === "automation"
    || value === "traders"
    || value === "markets"
    || value === "wallets"
    || value === "assistant";
}

function HomeContent() {
  const searchParams = useSearchParams();
  const [walletState, setWalletState] = useState<WalletState | null>(null);
  const [taskSnapshots, setTaskSnapshots] = useState<TaskSnapshot[]>([]);
  const [loadingWallets, setLoadingWallets] = useState(true);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [connectingKey, setConnectingKey] = useState<string | null>(null);

  const requestedView = searchParams.get("view");
  let activeView: DashboardView = "overview";
  if (isDashboardView(requestedView)) {
    activeView = requestedView;
  }

  const loadWallets = useCallback(async () => {
    try {
      setLoadingWallets(true);
      const response = await fetch("/api/wallets", { cache: "no-store" });
      const payload = await response.json();

      if (!response.ok) {
        setWalletState(null);
        return;
      }

      setWalletState(payload.data);
      setWalletError(null);
    } catch (error) {
      setWalletError(error instanceof Error ? error.message : "Failed to load wallets");
      setWalletState(null);
    } finally {
      setLoadingWallets(false);
    }
  }, []);

  const loadTaskSnapshots = useCallback(async () => {
    try {
      const response = await fetch("/api/copytrade/tasks", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) {
        setTaskSnapshots([]);
        return;
      }
      setTaskSnapshots(payload.data || []);
    } catch {
      setTaskSnapshots([]);
    }
  }, []);

  useEffect(() => {
    void loadWallets();
    void loadTaskSnapshots();
  }, [loadTaskSnapshots, loadWallets]);

  const connectWallet = useCallback(async (
    option: ProviderOption,
    authorize: (message: string) => Promise<BrowserWalletAuthorization>
  ) => {
    try {
      setConnectingKey(option.key);
      setWalletError(null);

      const detected = await authorize("Detecting wallet account");
      if (!detected.address) {
        throw new Error("Browser wallet did not return an address.");
      }

      const nonceResponse = await fetch("/api/auth/wallet/nonce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: detected.address,
          chain: option.chain,
          provider: option.provider,
        }),
      });

      const noncePayload = await nonceResponse.json();
      if (!nonceResponse.ok) {
        throw new Error(noncePayload.error || "Failed to create wallet auth nonce");
      }

      const authorization = await authorize(noncePayload.data.message);
      const signature = authorization.signature;

      if (!signature) {
        throw new Error("Wallet signature was not produced.");
      }

      const verifyResponse = await fetch("/api/auth/wallet/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: authorization.address,
          chain: option.chain,
          provider: option.provider,
          message: noncePayload.data.message,
          signature,
          label: option.title,
        }),
      });

      const verifyPayload = await verifyResponse.json();
      if (!verifyResponse.ok) {
        throw new Error(verifyPayload.error || "Wallet authorization failed");
      }

      await loadWallets();
    } catch (error) {
      setWalletError(error instanceof Error ? error.message : "Failed to connect wallet");
    } finally {
      setConnectingKey(null);
    }
  }, [loadWallets]);

  const authorizePolymarket = useCallback(async (walletId: string) => {
    try {
      setWalletError(null);
      const requestResponse = await fetch("/api/wallets/polymarket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletConnectionId: walletId }),
      });
      const requestPayload = await requestResponse.json();
      if (!requestResponse.ok) {
        throw new Error(requestPayload.error || "Failed to request Polymarket authorization");
      }

      const typedData = requestPayload.data.message;
      const wallet = walletState?.wallets.find((entry) => entry.id === walletId);
      if (!wallet) {
        throw new Error("Wallet not found for Polymarket authorization");
      }

      const providerWindow = window as Window & {
        ethereum?: {
          request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
        };
        phantom?: {
          ethereum?: {
            request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
          };
        };
      };

      const ethereumProvider = wallet.provider === "PHANTOM"
        ? providerWindow.phantom?.ethereum
        : providerWindow.ethereum;

      if (!ethereumProvider?.request) {
        throw new Error("EVM browser wallet is not available for Polymarket authorization");
      }

      const signature = await ethereumProvider.request({
        method: "eth_signTypedData_v4",
        params: [wallet.address, JSON.stringify(typedData)],
      });

      if (typeof signature !== "string") {
        throw new Error("Wallet did not return a typed-data signature");
      }

      const authorizeResponse = await fetch("/api/wallets/polymarket/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletConnectionId: walletId,
          signature,
        }),
      });
      const authorizePayload = await authorizeResponse.json();
      if (!authorizeResponse.ok) {
        throw new Error(authorizePayload.error || "Failed to authorize Polymarket credentials");
      }

      await loadWallets();
    } catch (error) {
      setWalletError(error instanceof Error ? error.message : "Failed to authorize Polymarket wallet");
    }
  }, [loadWallets, walletState?.wallets]);

  const wallets = useMemo(() => walletState?.wallets || [], [walletState?.wallets]);
  const authorizedWalletCount = useMemo(
    () => wallets.filter((wallet) => wallet.polymarketAuth?.state === "authorized").length,
    [wallets]
  );
  const reauthWalletCount = useMemo(
    () => wallets.filter((wallet) => wallet.polymarketAuth?.state === "requires_reauth").length,
    [wallets]
  );
  const activeTaskCount = useMemo(
    () => taskSnapshots.filter((task) => task.status === "active").length,
    [taskSnapshots]
  );
  const pendingExecutionCount = useMemo(
    () => taskSnapshots.reduce((sum, task) => sum + (task.pendingExecutions?.length || 0), 0),
    [taskSnapshots]
  );
  const blockedTaskCount = useMemo(
    () => taskSnapshots.filter((task) => task.executionAuthorizationReason).length,
    [taskSnapshots]
  );

  const operationsRail = [
    {
      label: "Wallets connected",
      value: wallets.length.toString(),
      detail: wallets.length > 0 ? `${authorizedWalletCount} execution-ready` : "No sessions yet",
      icon: Wallet,
    },
    {
      label: "Vault paths",
      value: String(walletState?.vaults.length || 0),
      detail: walletState?.vaults.length ? "Provisioned for unattended routing" : "Awaiting wallet auth",
      icon: ShieldCheck,
    },
    {
      label: "Active tasks",
      value: activeTaskCount.toString(),
      detail: pendingExecutionCount > 0 ? `${pendingExecutionCount} pending signatures` : "No execution queue",
      icon: Workflow,
    },
    {
      label: "Market guidance",
      value: "TimesNet",
      detail: blockedTaskCount > 0 ? `${blockedTaskCount} blocked by execution readiness` : "Decision support online",
      icon: BrainCircuit,
    },
  ];

  const overviewCards = [
    {
      label: "Execution-ready wallets",
      value: authorizedWalletCount.toString(),
      description: "EVM wallets with active Polymarket authorization are ready for browser-brokered order signing.",
      icon: ShieldCheck,
    },
    {
      label: "Pending signatures",
      value: pendingExecutionCount.toString(),
      description: "Use the automation book to inspect queued executions and sign or cancel them from the browser.",
      icon: Waves,
    },
    {
      label: "Live automation",
      value: activeTaskCount.toString(),
      description: "Copy-trade tasks stay isolated from research panels so operators can review lifecycle state faster.",
      icon: Workflow,
    },
    {
      label: "Reauth needed",
      value: reauthWalletCount.toString(),
      description: "Wallets that need refreshed credentials are separated from ready execution rails before tasks reach the brokered flow.",
      icon: Trophy,
    },
  ];

  const currentView = viewContent[activeView];

  function renderMainView() {
    if (activeView === "automation") {
      return (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-[28px] border border-white/10 bg-white/[0.035] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.2)]">
              <div className="text-sm text-muted-foreground">Active tasks</div>
              <div className="mt-3 text-3xl font-semibold tracking-tight">{activeTaskCount}</div>
              <div className="mt-2 text-sm text-muted-foreground">Strategies currently in the automation loop.</div>
            </div>
            <div className="rounded-[28px] border border-white/10 bg-white/[0.035] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.2)]">
              <div className="text-sm text-muted-foreground">Pending signatures</div>
              <div className="mt-3 text-3xl font-semibold tracking-tight">{pendingExecutionCount}</div>
              <div className="mt-2 text-sm text-muted-foreground">Queued executions waiting for browser confirmation.</div>
            </div>
            <div className="rounded-[28px] border border-white/10 bg-white/[0.035] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.2)]">
              <div className="text-sm text-muted-foreground">Blocked tasks</div>
              <div className="mt-3 text-3xl font-semibold tracking-tight">{blockedTaskCount}</div>
              <div className="mt-2 text-sm text-muted-foreground">Tasks that need wallet or execution readiness attention.</div>
            </div>
          </div>
          <CopyTradeTasksPanel wallets={wallets} />
        </div>
      );
    }

    if (activeView === "traders") {
      return <TraderActivityPanel />;
    }

    if (activeView === "markets") {
      return <MarketAnalysisPanel />;
    }

    if (activeView === "wallets") {
      return (
        <WalletPanel
          walletState={walletState}
          loading={loadingWallets}
          connectingKey={connectingKey}
          error={walletError}
          onRefresh={() => void loadWallets()}
          onConnect={connectWallet}
          onAuthorizePolymarket={(walletId) => authorizePolymarket(walletId)}
        />
      );
    }

    if (activeView === "assistant") {
      return (
        <div className="space-y-6">
          <div className="rounded-[30px] border border-white/10 bg-white/[0.035] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.2)]">
            <div className="text-[0.7rem] font-semibold uppercase tracking-[0.28em] text-primary/80">Operator prompts</div>
            <div className="mt-3 grid gap-3 lg:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-background/70 p-4 text-sm text-muted-foreground">
                Review blocked tasks and execution authorization issues before resuming automation.
              </div>
              <div className="rounded-2xl border border-white/10 bg-background/70 p-4 text-sm text-muted-foreground">
                Compare the highest-activity traders before creating new mirror strategies.
              </div>
              <div className="rounded-2xl border border-white/10 bg-background/70 p-4 text-sm text-muted-foreground">
                Ask for TimesNet-guided market context before signing queued orders.
              </div>
            </div>
          </div>
          <ChatInterface
            key="assistant-view"
            initialPrompt="Summarize blocked copy-trade tasks, pending executions, and the highest-conviction market right now."
          />
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
          {overviewCards.map(({ label, value, description, icon: Icon }) => (
            <div key={label} className="rounded-[28px] border border-white/10 bg-white/[0.035] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.2)]">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Icon className="h-4 w-4 text-primary" />
                {label}
              </div>
              <div className="mt-3 text-2xl font-semibold tracking-tight">{value}</div>
              <div className="mt-2 text-sm leading-6 text-muted-foreground">{description}</div>
            </div>
          ))}
        </div>

        <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.1fr)_360px]">
          <ChatInterface
            key="overview-view"
            initialPrompt="Show the most important trader, wallet, and execution readiness changes I should review before enabling automation."
          />
          <div className="space-y-6">
            <div className="rounded-[30px] border border-white/10 bg-white/[0.035] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.2)]">
              <div className="text-[0.7rem] font-semibold uppercase tracking-[0.28em] text-primary/80">Control priorities</div>
              <div className="mt-4 space-y-3 text-sm text-muted-foreground">
                <div className="rounded-2xl border border-white/10 bg-background/70 p-4">
                  Review wallet and Polymarket readiness before launching new automation.
                </div>
                <div className="rounded-2xl border border-white/10 bg-background/70 p-4">
                  Keep pending signature count low so strategy decisions do not stall in the execution queue.
                </div>
                <div className="rounded-2xl border border-white/10 bg-background/70 p-4">
                  Use the Traders and Markets sections for validation, then switch back to Automation for live task control.
                </div>
              </div>
            </div>
            <div className="rounded-[30px] border border-white/10 bg-white/[0.035] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.2)]">
              <div className="text-[0.7rem] font-semibold uppercase tracking-[0.28em] text-primary/80">Quick routes</div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link href="/?view=automation" className="rounded-full border border-white/10 bg-background/70 px-4 py-2 text-sm text-foreground transition hover:bg-white/[0.06]">
                  Open automation
                </Link>
                <Link href="/?view=wallets" className="rounded-full border border-white/10 bg-background/70 px-4 py-2 text-sm text-foreground transition hover:bg-white/[0.06]">
                  Review wallets
                </Link>
                <Link href="/?view=traders" className="rounded-full border border-white/10 bg-background/70 px-4 py-2 text-sm text-foreground transition hover:bg-white/[0.06]">
                  Scan traders
                </Link>
                <Link href="/?view=markets" className="rounded-full border border-white/10 bg-background/70 px-4 py-2 text-sm text-foreground transition hover:bg-white/[0.06]">
                  Inspect markets
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-6 lg:px-6 xl:px-8">
      <section className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-6 xl:sticky xl:top-6 xl:self-start">
          <div className="rounded-[30px] border border-white/10 bg-white/[0.035] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.24)]">
            <div className="flex items-center gap-2 text-[0.7rem] font-semibold uppercase tracking-[0.28em] text-primary/80">
              <Waves className="h-4 w-4" />
              Operations rail
            </div>
            <div className="mt-4 space-y-3">
              {operationsRail.map(({ label, value, detail, icon: Icon }) => (
                <div key={label} className="rounded-2xl border border-white/10 bg-background/70 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Icon className="h-4 w-4 text-primary" />
                      {label}
                    </div>
                    <div className="text-base font-semibold text-foreground">{value}</div>
                  </div>
                  <div className="mt-2 text-sm text-muted-foreground">{detail}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[30px] border border-white/10 bg-white/[0.035] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.24)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[0.7rem] font-semibold uppercase tracking-[0.28em] text-primary/80">Active surface</div>
                <h2 className="mt-2 text-xl font-semibold tracking-tight">{currentView.eyebrow}</h2>
              </div>
              <Badge variant="secondary" className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5">
                {activeView}
              </Badge>
            </div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{currentView.description}</p>
            <div className="mt-4 grid gap-3">
              <Link href="/?view=wallets" className="rounded-2xl border border-white/10 bg-background/70 px-4 py-3 text-sm text-foreground transition hover:bg-white/[0.06]">
                Review wallet authority and execution auth
              </Link>
              <Link href="/?view=automation" className="rounded-2xl border border-white/10 bg-background/70 px-4 py-3 text-sm text-foreground transition hover:bg-white/[0.06]">
                Open task automation and pending signatures
              </Link>
              <Link href="/?view=assistant" className="rounded-2xl border border-white/10 bg-background/70 px-4 py-3 text-sm text-foreground transition hover:bg-white/[0.06]">
                Ask the assistant for an operator summary
              </Link>
            </div>
          </div>
        </aside>

        <section className="space-y-6">
          <div className="rounded-[32px] border border-white/10 bg-white/[0.03] p-6 shadow-[0_28px_90px_rgba(0,0,0,0.28)]">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <div className="text-[0.7rem] font-semibold uppercase tracking-[0.28em] text-primary/80">{currentView.eyebrow}</div>
                <h2 className="mt-3 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                  {currentView.title}
                </h2>
                <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-[0.95rem]">
                  {currentView.description}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                <Badge variant="secondary" className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5">
                  {wallets.length} wallets tracked
                </Badge>
                <Badge variant="outline" className="rounded-full border-white/10 px-3 py-1.5">
                  {pendingExecutionCount} pending executions
                </Badge>
                <Badge variant="outline" className="rounded-full border-white/10 px-3 py-1.5">
                  {activeTaskCount} active tasks
                </Badge>
              </div>
            </div>
          </div>

          {renderMainView()}
        </section>
      </section>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div className="mx-auto min-h-[60vh] w-full max-w-[1600px] px-4 py-6 lg:px-6 xl:px-8" />}>
      <HomeContent />
    </Suspense>
  );
}
