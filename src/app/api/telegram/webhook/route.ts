import { NextRequest, NextResponse } from "next/server";
import {
  createTraceContext,
  emitMetric,
  logError,
  logInfo,
  startTimer,
} from "@/backend/observability";
import { handleTelegramUpdate, type TelegramUpdate } from "@/backend/services/telegram/handler";

export const runtime = "nodejs";
export const maxDuration = 60;

function validateWebhookSecret(request: NextRequest) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected) {
    return true;
  }

  return request.headers.get("x-telegram-bot-api-secret-token") === expected;
}

export async function POST(request: NextRequest) {
  const context = createTraceContext({
    traceId: request.headers.get("x-trace-id") || undefined,
    requestId: request.headers.get("x-request-id") || undefined,
    channel: "telegram",
  });
  const timer = startTimer();

  logInfo("Telegram webhook request started", {
    operation: "telegram_webhook_post",
    path: request.nextUrl.pathname,
  }, context);

  try {
    if (!validateWebhookSecret(request)) {
      return NextResponse.json({ success: false, error: "Invalid Telegram webhook secret" }, { status: 401 });
    }

    const body = await request.json() as TelegramUpdate;
    await handleTelegramUpdate(body, context);

    emitMetric("telegram_webhook_latency_ms", timer.elapsedMs(), {
      operation: "telegram_webhook_post",
      outcome: "success",
    }, context);
    logInfo("Telegram webhook request completed", {
      operation: "telegram_webhook_post",
      outcome: "success",
      duration_ms: timer.elapsedMs(),
      update_id: body.update_id,
    }, context);

    return NextResponse.json({ success: true });
  } catch (error) {
    emitMetric("telegram_webhook_latency_ms", timer.elapsedMs(), {
      operation: "telegram_webhook_post",
      outcome: "error",
    }, context);
    logError("Telegram webhook request failed", error, {
      operation: "telegram_webhook_post",
      outcome: "error",
      duration_ms: timer.elapsedMs(),
    }, context);

    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Telegram webhook failed" },
      { status: 500 },
    );
  }
}
