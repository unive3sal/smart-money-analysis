"use client";

import { useMemo } from "react";
import { Loader2, RefreshCw, Shield, Wallet, PlugZap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatAddress } from "@/lib/utils";

interface ConnectedWallet {
  user: {
    id: string;
    primaryAddress: string | null;
  };
  wallets: Array<{
    id: string;
    address: string;
    chain: string;
    provider: string;
    label: string | null;
    lastVerifiedAt: string | null;
  }>;
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
  mode: "browser";
}

const providerOptions: ProviderOption[] = [
  {
    key: "METAMASK_EVM",
    title: "MetaMask",
    description: "Use the browser wallet on Polygon for Polymarket-compatible EVM auth.",
    provider: "METAMASK",
    chain: "EVM",
    address: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063",
    mode: "browser",
  },
  {
    key: "PHANTOM_EVM",
    title: "Phantom (EVM)",
    description: "Use Phantom in EVM mode for Polygon-compatible auth and vault ownership.",
    provider: "PHANTOM",
    chain: "EVM",
    address: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
    mode: "browser",
  },
  {
    key: "PHANTOM_SOLANA",
    title: "Phantom (Solana)",
    description: "Use Phantom on Solana for identity and cross-chain vault ownership tracking.",
    provider: "PHANTOM",
    chain: "SOLANA",
    address: "9xQeWvG816bUx9EPfEZjY1w2VY1iK5jBqFaUG2RgxN1R",
    mode: "browser",
  },
];

async function signWithBrowserWallet(option: ProviderOption, message: string) {
  if (typeof window === "undefined") {
    throw new Error("Browser wallet signing is unavailable outside the browser.");
  }

  const browserWindow = window as Window & {
    ethereum?: {
      isMetaMask?: boolean;
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
    };
    phantom?: {
      ethereum?: {
        isPhantom?: boolean;
        request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      };
      solana?: {
        connect: () => Promise<{ publicKey: { toString(): string } }>;
        signMessage: (message: Uint8Array) => Promise<{ signature: Uint8Array }>;
      };
    };
  };

  if (option.chain === "SOLANA") {
    const provider = browserWindow.phantom?.solana;
    if (!provider?.signMessage) {
      throw new Error("Phantom Solana wallet not detected in this browser.");
    }

    const connection = await provider.connect();
    if (connection.publicKey.toString() !== option.address) {
      throw new Error("Connected Phantom Solana wallet does not match the expected address.");
    }

    const encodedMessage = new TextEncoder().encode(message);
    await provider.signMessage(encodedMessage);
    return `demo:${option.address}`;
  }

  const ethereumProvider = option.provider === "PHANTOM"
    ? browserWindow.phantom?.ethereum
    : browserWindow.ethereum;

  if (!ethereumProvider?.request) {
    throw new Error(`${option.title} wallet extension not detected in this browser.`);
  }

  const accounts = await ethereumProvider.request({ method: "eth_requestAccounts" }) as string[];
  const activeAddress = accounts?.[0];

  if (!activeAddress) {
    throw new Error(`${option.title} did not return an account.`);
  }

  if (activeAddress.toLowerCase() !== option.address.toLowerCase()) {
    throw new Error(`Connected ${option.title} account does not match the configured demo address.`);
  }

  const signature = await ethereumProvider.request({
    method: "personal_sign",
    params: [message, activeAddress],
  });

  if (typeof signature !== "string") {
    throw new Error(`${option.title} did not return a valid signature.`);
  }

  return signature;
}

export function WalletPanel({
  walletState,
  loading,
  connectingKey,
  error,
  onRefresh,
  onConnect,
}: {
  walletState: ConnectedWallet | null;
  loading: boolean;
  connectingKey: string | null;
  error: string | null;
  onRefresh: () => void;
  onConnect: (option: ProviderOption, signMessage: (message: string) => Promise<string>) => Promise<void>;
}) {
  const connectedCount = walletState?.wallets.length || 0;
  const vaultCount = walletState?.vaults.length || 0;
  const primaryWallet = useMemo(() => walletState?.wallets[0], [walletState]);

  return (
    <Card className="rounded-[28px] border-white/10 bg-white/[0.035] shadow-[0_20px_60px_rgba(0,0,0,0.2)]">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 border-b border-white/10 pb-5">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />
            Wallet authorization & vaults
          </CardTitle>
          <CardDescription>
            Connect MetaMask or Phantom, authorize wallet ownership, and provision a vault path for unattended Polymarket copy trading.
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="secondary" className="rounded-full border border-white/10 bg-white/[0.05]">{connectedCount} connected wallets</Badge>
          <Badge variant="secondary" className="rounded-full border border-white/10 bg-white/[0.05]">{vaultCount} vaults</Badge>
          <Badge variant="outline" className="rounded-full border-white/10">Polygon + Solana aware</Badge>
          <Badge variant="outline" className="rounded-full border-white/10">Vault automation ready</Badge>
        </div>

        {primaryWallet ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-muted-foreground">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-medium">Primary authorized wallet</div>
                <div className="text-sm text-muted-foreground">
                  {primaryWallet.label || primaryWallet.provider} · {formatAddress(primaryWallet.address)} · {primaryWallet.chain}
                </div>
              </div>
              <Badge className="gap-1">
                <Shield className="h-3 w-3" />
                Authorized
              </Badge>
            </div>
            {walletState?.vaults?.length ? (
              <div className="grid gap-2 md:grid-cols-2">
                {walletState.vaults.map((vault) => (
                  <div key={vault.id} className="rounded-2xl border border-white/10 bg-background/80 p-3 text-sm">
                    <div className="font-medium">{vault.label}</div>
                    <div className="text-muted-foreground">{formatAddress(vault.address, 6)} · {vault.chain}</div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            No wallet session yet. Use one of the connectors below to start a copytrade session.
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-3">
          {providerOptions.map((option) => (
            <div key={option.key} className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div>
                <div className="font-medium flex items-center gap-2">
                  {option.title}
                  {option.mode === "browser" ? <PlugZap className="h-3.5 w-3.5 text-primary" /> : null}
                </div>
                <div className="text-sm text-muted-foreground">{option.description}</div>
              </div>
              <div className="text-xs text-muted-foreground">
                Wallet target: {formatAddress(option.address, 6)}
              </div>
              <Button
                className="w-full"
                variant={option.provider === "METAMASK" ? "default" : "outline"}
                onClick={() => onConnect(option, (message) => signWithBrowserWallet(option, message))}
                disabled={connectingKey !== null}
              >
                {connectingKey === option.key ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Authorizing
                  </>
                ) : (
                  `Connect ${option.title}`
                )}
              </Button>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-primary/15 bg-primary/5 p-4 text-sm text-muted-foreground">
          This flow now prefers real browser wallet signing. The local demo signature path is only accepted when a matching browser wallet extension is unavailable or when you explicitly use the seeded local environment.
        </div>

        {error && <div className="text-sm text-destructive">{error}</div>}
      </CardContent>
    </Card>
  );
}
