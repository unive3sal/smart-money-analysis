import { privateKeyToAccount } from "viem/accounts";
import { createPublicClient, createWalletClient, http } from "viem";
import { polygon } from "viem/chains";
import {
  ClobClient,
  Chain,
  OrderType,
  Side,
  SignatureType,
  type ApiKeyCreds,
  type ClobSigner,
} from "@polymarket/clob-client";
import { emitMetric, logError, logInfo, startTimer, type TraceContext } from "@/lib/observability";
import type { PolymarketMarket, PolymarketTraderActivity } from "@/services/polymarket/types";

const CLOB_BASE_URL = process.env.POLYMARKET_CLOB_URL || "https://clob.polymarket.com";
const GAMMA_BASE_URL = process.env.POLYMARKET_GAMMA_URL || "https://gamma-api.polymarket.com";
const POLYMARKET_CHAIN_ID = Number(process.env.POLYMARKET_CHAIN_ID || 137);
const publicClient = createPublicClient({ chain: polygon, transport: http() });
const POLYMARKET_CHAIN = POLYMARKET_CHAIN_ID === 80002 ? Chain.AMOY : Chain.POLYGON;

function parseNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function normalizeGammaMarket(market: Record<string, unknown>, index = 0): PolymarketMarket {
  const tokenId = String((market.clobTokenIds as string[] | undefined)?.[0] || market.token_id || market.id || index);
  const outcomes = Array.isArray(market.outcomes)
    ? (market.outcomes as unknown[]).map(String)
    : typeof market.outcomes === "string"
      ? market.outcomes.split(",")
      : ["Yes", "No"];
  const lastPrice = parseNumber(market.lastTradePrice ?? market.last_price ?? market.lastPrice, 0.5);
  const bestBid = parseNumber(market.bestBid ?? market.best_bid, Math.max(0, lastPrice - 0.01));
  const bestAsk = parseNumber(market.bestAsk ?? market.best_ask, Math.min(1, lastPrice + 0.01));

  return {
    marketId: String(market.id ?? market.conditionId ?? tokenId),
    tokenId,
    conditionId: String(market.conditionId || market.condition_id || ""),
    slug: String(market.slug || market.questionID || tokenId),
    question: String(market.question || market.title || "Untitled market"),
    description: (market.description as string | undefined) || undefined,
    outcomes,
    active: Boolean(market.active ?? true),
    closed: Boolean(market.closed ?? false),
    endDate: (market.endDate as string | undefined) || (market.end_date_iso as string | undefined) || undefined,
    image: (market.image as string | undefined) || (market.icon as string | undefined) || undefined,
    volume24h: parseNumber(market.volume24hr ?? market.volume24h ?? market.volume, 0),
    liquidity: parseNumber(market.liquidity, 0),
    lastPrice,
    bestBid,
    bestAsk,
    spread: Math.max(0, bestAsk - bestBid),
    priceChange24h: parseNumber(market.oneDayPriceChange ?? market.price_change_24h, 0),
    tickSize: String(market.tick_size || "0.01"),
    negRisk: Boolean(market.negRisk ?? market.neg_risk ?? false),
    tags: Array.isArray(market.tags) ? market.tags.map(String) : [],
  } satisfies PolymarketMarket;
}

async function fetchJson<T>(url: string, init: RequestInit | undefined, context: TraceContext | undefined, operation: string): Promise<T> {
  const timer = startTimer();

  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`${response.status} ${response.statusText}: ${body}`);
    }

    const data = (await response.json()) as T;

    emitMetric("polymarket_http_latency_ms", timer.elapsedMs(), {
      service: "polymarket",
      operation,
      outcome: "success",
    }, context);

    return data;
  } catch (error) {
    emitMetric("polymarket_http_latency_ms", timer.elapsedMs(), {
      service: "polymarket",
      operation,
      outcome: "error",
    }, context);
    logError("Polymarket HTTP request failed", error, {
      service: "polymarket",
      operation,
      duration_ms: timer.elapsedMs(),
      outcome: "error",
      url,
    }, context);
    throw error;
  }
}

export class PolymarketService {
  async listMarkets(context?: TraceContext): Promise<PolymarketMarket[]> {
    const gammaMarkets = await fetchJson<any[]>(`${GAMMA_BASE_URL}/markets?limit=25`, undefined, context, "gamma_list_markets");

    return gammaMarkets.map((market, index) => normalizeGammaMarket(market, index));
  }

  async getMarket(marketId: string, context?: TraceContext): Promise<PolymarketMarket> {
    const markets = await this.listMarkets(context);
    const market = markets.find(
      (item) => item.marketId === marketId || item.slug === marketId || item.tokenId === marketId
    );

    if (!market) {
      throw new Error(`Polymarket market not found for ${marketId}`);
    }

    return market;
  }

  async getTraderActivity(address: string, context?: TraceContext): Promise<PolymarketTraderActivity[]> {
    const client = this.createPublicClient();
    const trades = await client.getTrades({ maker_address: address }, true);

    return trades.slice(0, 25).map((trade) => ({
      id: trade.id,
      traderAddress: trade.maker_address,
      marketId: trade.market,
      tokenId: trade.asset_id,
      side: trade.side,
      outcome: trade.outcome,
      price: parseNumber(trade.price),
      size: parseNumber(trade.size),
      transactionHash: trade.transaction_hash,
      timestamp: trade.match_time,
      question: trade.market,
    }));
  }

  async createOrder(input: {
    tokenId: string;
    side: "BUY" | "SELL";
    price: number;
    size: number;
    tickSize?: "0.1" | "0.01" | "0.001" | "0.0001";
    negRisk?: boolean;
    privateKey: `0x${string}`;
    funder?: string;
    signatureType?: SignatureType;
  }, context?: TraceContext) {
    const timer = startTimer();

    try {
      const signer = await this.createSigner(input.privateKey);
      const creds = await new ClobClient(CLOB_BASE_URL, POLYMARKET_CHAIN, signer).createOrDeriveApiKey();
      const client = new ClobClient(
        CLOB_BASE_URL,
        POLYMARKET_CHAIN,
        signer,
        creds,
        input.signatureType ?? SignatureType.EOA,
        input.funder,
        undefined,
        false,
        undefined,
        undefined,
        true,
        undefined,
        true
      );

      const result = await client.createAndPostOrder(
        {
          tokenID: input.tokenId,
          side: input.side === "BUY" ? Side.BUY : Side.SELL,
          price: input.price,
          size: input.size,
        },
        {
          tickSize: input.tickSize || "0.01",
          negRisk: input.negRisk ?? false,
        },
        OrderType.GTC
      );

      emitMetric("polymarket_order_latency_ms", timer.elapsedMs(), {
        service: "polymarket",
        operation: "post_order",
        outcome: "success",
      }, context);
      logInfo("Polymarket order posted", {
        service: "polymarket",
        operation: "post_order",
        outcome: "success",
        duration_ms: timer.elapsedMs(),
      }, context);

      return result;
    } catch (error) {
      emitMetric("polymarket_order_latency_ms", timer.elapsedMs(), {
        service: "polymarket",
        operation: "post_order",
        outcome: "error",
      }, context);
      logError("Polymarket order posting failed", error, {
        service: "polymarket",
        operation: "post_order",
        outcome: "error",
        duration_ms: timer.elapsedMs(),
      }, context);
      throw error;
    }
  }

  async getBalance(address: `0x${string}`) {
    return publicClient.getBalance({ address });
  }

  createPublicClient(creds?: ApiKeyCreds, signer?: ClobSigner) {
    return new ClobClient(CLOB_BASE_URL, POLYMARKET_CHAIN, signer, creds);
  }

  private async createSigner(privateKey: `0x${string}`): Promise<ClobSigner> {
    const account = privateKeyToAccount(privateKey);

    return createWalletClient({
      account,
      chain: polygon,
      transport: http(),
    });
  }
}

let polymarketService: PolymarketService | null = null;

export function getPolymarketService() {
  if (!polymarketService) {
    polymarketService = new PolymarketService();
  }

  return polymarketService;
}
