"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, Bot, BrainCircuit, Trophy, Wallet } from "lucide-react";
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

  const wallets = walletState?.wallets || [];

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Activity className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-bold">Polymarket Copytrade Control Center</h1>
                <p className="text-sm text-muted-foreground">
                  Wallet authorization, trader discovery, automated copytrade tasks, and TimesNet market filtering.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <div className="flex items-center gap-2 rounded-full border px-3 py-1.5">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                Live trader monitoring
              </div>
              <div className="rounded-full border px-3 py-1.5">Polygon + Solana wallets</div>
              <div className="rounded-full border px-3 py-1.5">TimesNet execution filter</div>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6 space-y-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border bg-card p-5">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Wallet className="h-4 w-4" />
              Authorized wallets
            </div>
            <div className="mt-2 text-3xl font-semibold">{wallets.length}</div>
            <div className="mt-2 text-sm text-muted-foreground">MetaMask and Phantom session support with vault-ready execution ownership.</div>
          </div>
          <div className="rounded-xl border bg-card p-5">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Trophy className="h-4 w-4" />
              Trader discovery
            </div>
            <div className="mt-2 text-3xl font-semibold">Top ranked</div>
            <div className="mt-2 text-sm text-muted-foreground">Leaderboard, realtime activity, win rate, and PnL visibility for source traders.</div>
          </div>
          <div className="rounded-xl border bg-card p-5">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <BrainCircuit className="h-4 w-4" />
              AI market filter
            </div>
            <div className="mt-2 text-3xl font-semibold">TimesNet</div>
            <div className="mt-2 text-sm text-muted-foreground">Market-level AI analysis snapshots used to approve or block mirrored fills.</div>
          </div>
          <div className="rounded-xl border bg-card p-5">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Bot className="h-4 w-4" />
              Agent control
            </div>
            <div className="mt-2 text-3xl font-semibold">Chat + tools</div>
            <div className="mt-2 text-sm text-muted-foreground">Inspect traders, tasks, and markets in natural language from the assistant pane.</div>
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

        <div className="grid gap-6 xl:grid-cols-[1.45fr_1fr]">
          <CopyTradeTasksPanel wallets={wallets} />
          <div className="min-w-0">
            <ChatInterface initialPrompt="Show the top Polymarket traders and summarize the highest-conviction market." />
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.15fr_1fr]">
          <TraderActivityPanel />
          <MarketAnalysisPanel />
        </div>
      </div>
    </main>
  );
}
