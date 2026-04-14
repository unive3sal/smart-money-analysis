import ccxt from "ccxt";
import { emitMetric, logError, logInfo, type TraceContext } from "@/lib/observability";

type SupportedExchangeId = "binance" | "bybit" | "okx" | "kraken" | "coinbase" | "kucoin" | "bitget";
type OhlcvTimeframe = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";

export interface MarketTokenInfo {
  exchangeId: string;
  symbol: string;
  base: string;
  quote: string;
  price: number;
  priceChange24h: number;
  volume24h: number;
  high24h: number;
  low24h: number;
  bid: number;
  ask: number;
}

const DEFAULT_EXCHANGE_ID = (process.env.CCXT_EXCHANGE_ID || "binance") as SupportedExchangeId;
const DEFAULT_QUOTE = (process.env.CCXT_DEFAULT_QUOTE || "USDT").toUpperCase();

class MarketDataClient {
  private exchange: any = null;
  private loadedMarkets = false;

  private createExchange(): any {
    const options = { enableRateLimit: true };

    switch (DEFAULT_EXCHANGE_ID) {
      case "binance":
        return new ccxt.binance(options);
      case "bybit":
        return new ccxt.bybit(options);
      case "okx":
        return new ccxt.okx(options);
      case "kraken":
        return new ccxt.kraken(options);
      case "coinbase":
        return new ccxt.coinbase(options);
      case "kucoin":
        return new ccxt.kucoin(options);
      case "bitget":
        return new ccxt.bitget(options);
      default:
        throw new Error(`Unsupported CCXT exchange: ${DEFAULT_EXCHANGE_ID}`);
    }
  }

  private async getExchange(): Promise<any> {
    if (!this.exchange) {
      this.exchange = this.createExchange();
    }

    if (!this.loadedMarkets) {
      await this.exchange.loadMarkets();
      this.loadedMarkets = true;
    }

    return this.exchange;
  }

  async resolveSymbol(input: string, context?: TraceContext): Promise<string> {
    const normalized = input.trim().toUpperCase();
    const exchange = await this.getExchange();
    const markets = exchange.markets as Record<string, any>;

    if (!normalized) {
      throw new Error("Token symbol is required");
    }

    if (markets[normalized]) {
      return normalized;
    }

    const direct = `${normalized}/${DEFAULT_QUOTE}`;
    if (markets[direct]) {
      return direct;
    }

    for (const symbol of Object.keys(markets)) {
      const market = markets[symbol];
      if (!market?.active) {
        continue;
      }

      if (market.base?.toUpperCase() === normalized && market.quote?.toUpperCase() === DEFAULT_QUOTE) {
        return symbol;
      }
    }

    logError(
      "CCXT symbol resolution failed",
      new Error("Market not found"),
      {
        service: "ccxt",
        operation: "resolve_symbol",
        input: normalized,
        exchange_id: DEFAULT_EXCHANGE_ID,
      },
      context
    );
    throw new Error(`No ${DEFAULT_QUOTE} market found for ${normalized} on ${DEFAULT_EXCHANGE_ID}`);
  }

  async getTokenInfo(input: string, context?: TraceContext): Promise<MarketTokenInfo> {
    const exchange = await this.getExchange();
    const symbol = await this.resolveSymbol(input, context);
    const ticker = await exchange.fetchTicker(symbol);
    const market = (exchange.market(symbol) ?? {}) as Record<string, any>;

    emitMetric(
      "ccxt_ticker_fetch",
      1,
      {
        service: "ccxt",
        operation: "fetch_ticker",
        exchange_id: DEFAULT_EXCHANGE_ID,
      },
      context
    );
    logInfo(
      "CCXT ticker fetched",
      {
        service: "ccxt",
        operation: "fetch_ticker",
        exchange_id: DEFAULT_EXCHANGE_ID,
        symbol,
      },
      context
    );

    return {
      exchangeId: DEFAULT_EXCHANGE_ID,
      symbol,
      base: String(market.base || ""),
      quote: String(market.quote || ""),
      price: ticker.last ?? 0,
      priceChange24h: ticker.percentage ?? 0,
      volume24h: ticker.quoteVolume ?? ((ticker.baseVolume ?? 0) * (ticker.last ?? 0)),
      high24h: ticker.high ?? 0,
      low24h: ticker.low ?? 0,
      bid: ticker.bid ?? 0,
      ask: ticker.ask ?? 0,
    };
  }

  async getPriceHistory(
    input: string,
    timeframe: OhlcvTimeframe = "15m",
    limit = 96,
    context?: TraceContext
  ): Promise<number[]> {
    const exchange = await this.getExchange();
    const symbol = await this.resolveSymbol(input, context);

    if (!exchange.has.fetchOHLCV) {
      throw new Error(`${DEFAULT_EXCHANGE_ID} does not support OHLCV history via CCXT`);
    }

    const candles = (await exchange.fetchOHLCV(symbol, timeframe, undefined, limit)) as number[][];
    emitMetric(
      "ccxt_ohlcv_fetch",
      candles.length,
      {
        service: "ccxt",
        operation: "fetch_ohlcv",
        exchange_id: DEFAULT_EXCHANGE_ID,
        timeframe,
      },
      context
    );
    logInfo(
      "CCXT OHLCV fetched",
      {
        service: "ccxt",
        operation: "fetch_ohlcv",
        exchange_id: DEFAULT_EXCHANGE_ID,
        symbol,
        timeframe,
        points: candles.length,
      },
      context
    );

    return candles
      .map((candle: number[]) => candle[4])
      .filter((close: number | undefined): close is number => typeof close === "number" && Number.isFinite(close));
  }
}

let marketDataClient: MarketDataClient | null = null;

export function getMarketDataClient(): MarketDataClient {
  if (!marketDataClient) {
    marketDataClient = new MarketDataClient();
  }

  return marketDataClient;
}
