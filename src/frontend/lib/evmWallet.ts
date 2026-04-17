"use client";

import { createWalletClient, custom, type WalletClient } from "viem";
import { polygon } from "viem/chains";

type EvmProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

type BrowserWindow = Window & {
  ethereum?: EvmProvider;
  phantom?: {
    ethereum?: EvmProvider;
  };
};

function getProvider(provider: "METAMASK" | "PHANTOM") {
  const browserWindow = window as BrowserWindow;
  return provider === "PHANTOM"
    ? browserWindow.phantom?.ethereum
    : browserWindow.ethereum;
}

export async function getBrowserEvmWalletClient(input: {
  provider: "METAMASK" | "PHANTOM";
  expectedAddress: string;
}): Promise<WalletClient> {
  if (typeof window === "undefined") {
    throw new Error("Browser wallet access is unavailable outside the browser.");
  }

  const provider = getProvider(input.provider);
  if (!provider) {
    throw new Error(`${input.provider} browser wallet is not available.`);
  }

  const accounts = await provider.request({ method: "eth_requestAccounts" }) as string[];
  const activeAddress = accounts?.[0];

  if (!activeAddress) {
    throw new Error("Browser wallet did not return an account.");
  }

  if (activeAddress.toLowerCase() !== input.expectedAddress.toLowerCase()) {
    throw new Error(`Connected wallet ${activeAddress} does not match the expected task wallet ${input.expectedAddress}.`);
  }

  return createWalletClient({
    chain: polygon,
    transport: custom(provider),
  });
}
