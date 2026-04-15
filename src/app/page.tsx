"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bot, BrainCircuit, Trophy, Wallet, Waves } from "lucide-react";
import { ChatInterface } from "@/components/ChatInterface";
import { WalletPanel } from "@/components/wallet/WalletPanel";
import { CopyTradeTasksPanel } from "@/components/dashboard/CopyTradeTasksPanel";
import { TraderActivityPanel } from "@/components/dashboard/TraderActivityPanel";
import { MarketAnalysisPanel } from "@/components/dashboard/MarketAnalysisPanel";

interface WalletSummary {
  id: string;
  address: string;
  provider: string;
  chain: string;
  label: string | null;
  lastVerifiedAt: string | null;
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
  address: string;
  mode: "demo" | "browser";
}

const focusMetrics = [
  {
    label: "Wallet authority",
    value: "Session ready",
    description: "Authorized wallets and vault ownership remain visible in the sidebar.",
    icon: Wallet,
  },
  {
    label: "Trader signal",
    value: "High-conviction",
    description: "Live leaderboard context stays adjacent to execution workflows.",
    icon: Trophy,
  },
  {
    label: "Market filter",
    value: "TimesNet",
    description: "AI guidance supports task decisions without taking over the workflow.",
    icon: BrainCircuit,
  },
  {
    label: "Command flow",
    value: "Chat-first",
    description: "Natural language control remains anchored in the main focus area.",
    icon: Bot,
  },
];

export default function Home() {
  const [walletState, setWalletState] = useState<WalletState | null>(null);
  const [loadingWallets, setLoadingWallets] = useState(true);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [connectingKey, setConnectingKey] = useState<string | null>(null);

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

  useEffect(() => {
    void loadWallets();
  }, [loadWallets]);

  const connectWallet = useCallback(async (
    option: ProviderOption,
    signMessage: (message: string) => Promise<string>
  ) => {
    try {
      setConnectingKey(option.key);
      setWalletError(null);

      const nonceResponse = await fetch("/api/auth/wallet/nonce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: option.address,
          chain: option.chain,
          provider: option.provider,
        }),
      });

      const noncePayload = await nonceResponse.json();
      if (!nonceResponse.ok) {
        throw new Error(noncePayload.error || "Failed to create wallet auth nonce");
      }

      const signature = await signMessage(noncePayload.data.message);

      if (!signature) {
        throw new Error("Wallet signature was not produced.");
      }

      const verifyResponse = await fetch("/api/auth/wallet/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: option.address,
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

  const wallets = useMemo(() => walletState?.wallets || [], [walletState?.wallets]);
  const commandDeckStats = useMemo(() => [
    { label: "Connected wallets", value: wallets.length.toString() },
    { label: "Primary rail", value: wallets[0]?.chain || "Awaiting auth" },
    { label: "Vault paths", value: String(walletState?.vaults.length || 0) },
  ], [walletState?.vaults.length, wallets]);

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-6 lg:px-6 xl:px-8">
      <section className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="space-y-6 xl:sticky xl:top-6 xl:self-start">
          <div className="rounded-[30px] border border-white/10 bg-white/[0.035] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.24)]">
            <div className="flex items-center gap-2 text-[0.7rem] font-semibold uppercase tracking-[0.28em] text-primary/80">
              <Waves className="h-4 w-4" />
              Sidebar command rail
            </div>
            <div className="mt-4 space-y-3">
              <h2 className="text-xl font-semibold tracking-tight">Prepare capital, verify rails, and frame the trading session.</h2>
              <p className="text-sm leading-6 text-muted-foreground">
                The sidebar keeps wallet authority and operating context visible while the center deck stays focused on chat, automation, and analysis.
              </p>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
              {commandDeckStats.map((item) => (
                <div key={item.label} className="rounded-2xl border border-white/10 bg-background/70 px-4 py-3">
                  <div className="text-[0.68rem] uppercase tracking-[0.24em] text-muted-foreground">{item.label}</div>
                  <div className="mt-2 text-sm font-medium">{item.value}</div>
                </div>
              ))}
            </div>
          </div>

          <WalletPanel
            walletState={walletState}
            loading={loadingWallets}
            connectingKey={connectingKey}
            error={walletError}
            onRefresh={() => void loadWallets()}
            onConnect={connectWallet}
          />
        </aside>

        <section className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
            {focusMetrics.map(({ label, value, description, icon: Icon }) => (
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

          <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
            <div className="space-y-6">
              <div className="rounded-[32px] border border-white/10 bg-white/[0.03] p-3 shadow-[0_28px_90px_rgba(0,0,0,0.28)]">
                <ChatInterface
                  className="border-0 bg-transparent shadow-none"
                  initialPrompt="Show the top Polymarket traders and summarize the highest-conviction market."
                />
              </div>

              <CopyTradeTasksPanel wallets={wallets} />
            </div>

            <div className="space-y-6">
              <div className="rounded-[30px] border border-white/10 bg-white/[0.035] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.2)]">
                <div className="text-[0.7rem] font-semibold uppercase tracking-[0.28em] text-primary/80">Focus area</div>
                <div className="mt-3 space-y-3">
                  <h2 className="text-xl font-semibold tracking-tight">Execution intelligence stays in the center lane.</h2>
                  <p className="text-sm leading-6 text-muted-foreground">
                    Chat drives investigation, tasks capture automation, and market panels stay close enough to validate every move without crowding the primary workflow.
                  </p>
                </div>
              </div>

              <TraderActivityPanel />
              <MarketAnalysisPanel />
            </div>
          </div>
        </section>
      </section>
    </div>
  );
}
