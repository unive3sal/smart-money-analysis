"use client";

import { ClobClient, SignatureType, Side, type ApiKeyCreds } from "@polymarket/clob-client";
import type { SignedOrder } from "@polymarket/clob-client/dist/order-utils/model/order.model";
import type { WalletClient } from "viem";
import type { BrokeredExecutionPreparePayload } from "@/backend/services/polymarket/types";

const CLOB_BASE_URL = process.env.NEXT_PUBLIC_POLYMARKET_CLOB_URL || "https://clob.polymarket.com";
const POLYMARKET_CHAIN_ID = Number(process.env.NEXT_PUBLIC_POLYMARKET_CHAIN_ID || 137);

export async function buildBrowserBrokeredOrder(input: {
  walletClient: WalletClient;
  preparePayload: BrokeredExecutionPreparePayload;
  creds: ApiKeyCreds;
}) {
  const client = new ClobClient(
    CLOB_BASE_URL,
    POLYMARKET_CHAIN_ID as 137 | 80002,
    input.walletClient,
    input.creds,
    SignatureType.EOA,
    input.preparePayload.funderAddress || undefined
  );

  return client.createOrder(
    {
      tokenID: input.preparePayload.tokenId,
      side: input.preparePayload.side === "BUY" ? Side.BUY : Side.SELL,
      price: input.preparePayload.price,
      size: input.preparePayload.size,
    },
    {
      tickSize: String(input.preparePayload.metadata.tickSize || "0.01") as "0.1" | "0.01" | "0.001" | "0.0001",
      negRisk: Boolean(input.preparePayload.metadata.negRisk),
    }
  ) as Promise<SignedOrder>;
}
