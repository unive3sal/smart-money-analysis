import {
  emitMetric,
  logError,
  logInfo,
  startTimer,
  type TraceContext,
} from "@/lib/observability";

const TIMESNET_SERVICE_URL = process.env.TIMESNET_SERVICE_URL || "http://localhost:8001";

export interface TimesNetQueryRequest {
  token_symbol: string;
  token_address?: string;
  query_type: "forecast" | "anomaly" | "full";
  price_history: number[];
  volume_history?: number[];
}

export interface TimesNetQueryResponse {
  summary?: string;
  signal?: string;
  confidence?: number;
  details?: Record<string, unknown>;
  [key: string]: unknown;
}

export async function queryTimesNet(
  body: TimesNetQueryRequest,
  context?: TraceContext
): Promise<{ success: boolean; data?: TimesNetQueryResponse; error?: string }> {
  const timer = startTimer();

  try {
    logInfo("TimesNet advisory request started", {
      service: "timesnet",
      operation: "timesnet_query",
      query_type: body.query_type,
      history_points: body.price_history.length,
      endpoint: "/query",
    }, context);

    const response = await fetch(`${TIMESNET_SERVICE_URL}/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      emitMetric("timesnet_request_latency_ms", timer.elapsedMs(), {
        service: "timesnet",
        operation: "timesnet_query",
        outcome: "error",
        query_type: body.query_type,
      }, context);
      logError("TimesNet advisory request failed", new Error(`TimesNet service error: ${errorText}`), {
        service: "timesnet",
        operation: "timesnet_query",
        outcome: "error",
        duration_ms: timer.elapsedMs(),
        query_type: body.query_type,
        endpoint: "/query",
      }, context);
      return { success: false, error: `TimesNet service error: ${errorText}` };
    }

    const data = (await response.json()) as TimesNetQueryResponse;

    emitMetric("timesnet_request_latency_ms", timer.elapsedMs(), {
      service: "timesnet",
      operation: "timesnet_query",
      outcome: "success",
      query_type: body.query_type,
    }, context);
    logInfo("TimesNet advisory request completed", {
      service: "timesnet",
      operation: "timesnet_query",
      outcome: "success",
      duration_ms: timer.elapsedMs(),
      query_type: body.query_type,
      endpoint: "/query",
    }, context);

    return { success: true, data };
  } catch (error) {
    emitMetric("timesnet_request_latency_ms", timer.elapsedMs(), {
      service: "timesnet",
      operation: "timesnet_query",
      outcome: "error",
      query_type: body.query_type,
    }, context);
    logError("TimesNet advisory request crashed", error, {
      service: "timesnet",
      operation: "timesnet_query",
      outcome: "error",
      duration_ms: timer.elapsedMs(),
      query_type: body.query_type,
      endpoint: "/query",
    }, context);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to connect to TimesNet service",
    };
  }
}
