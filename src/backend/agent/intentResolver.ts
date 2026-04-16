export type PlatformIntentType =
  | "copy_trade_task"
  | "top_traders"
  | "market_analysis"
  | "wallet_status"
  | "other";

export interface PlatformIntent {
  intentId: string;
  rawInput: string;
  intentType: PlatformIntentType;
  extractedParameters: Record<string, unknown>;
  confidence: number;
  status: "resolved";
  message?: string;
  resolvedAt: string;
}

function detectTimeframe(input: string): string | undefined {
  const timeframeMatch = input.match(/\b(5m|15m|30m|1h|2h|4h|6h|8h|24h)\b/i);
  return timeframeMatch?.[1]?.toLowerCase();
}

function detectTokenSymbol(input: string): string | undefined {
  const tokenMatch = input.match(/\b(?:for|on|get|analyze|forecast|predict|detect)\s+([A-Z]{2,10})\b/);
  return tokenMatch?.[1]?.toUpperCase();
}

function resolveIntentType(input: string): PlatformIntentType {
  if (/(copy( |-)?trad|follow strategy|start task|create task|pause task|resume task|stop task|delete task)/i.test(input)) {
    return "copy_trade_task";
  }

  if (/(top traders?|leaderboard|trader activity|trader feed)/i.test(input)) {
    return "top_traders";
  }

  if (/(wallet|vault|authorization|metamask|phantom)/i.test(input)) {
    return "wallet_status";
  }

  if (/(polymarket|market analysis|timesnet|event market)/i.test(input)) {
    return "market_analysis";
  }

  return "other";
}

export function resolvePlatformIntent(rawInput: string): PlatformIntent {
  const normalized = rawInput.trim();
  const resolvedAt = new Date().toISOString();
  const intentType = resolveIntentType(normalized);

  return {
    intentId: crypto.randomUUID(),
    rawInput: normalized,
    intentType,
    extractedParameters: {
      tokenSymbol: detectTokenSymbol(normalized),
      timeframe: detectTimeframe(normalized),
    },
    confidence: intentType === "other" ? 0.45 : 0.91,
    status: "resolved",
    resolvedAt,
  };
}

export function buildIntentGateResponse(_intent: PlatformIntent): string | null {
  return null;
}
