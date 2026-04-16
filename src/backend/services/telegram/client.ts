import {
  emitMetric,
  logError,
  logInfo,
  startTimer,
  type TraceContext,
} from "@/backend/observability";

const TELEGRAM_API_BASE = process.env.TELEGRAM_API_BASE || "https://api.telegram.org";

export interface TelegramInlineButton {
  text: string;
  callback_data?: string;
}

export interface TelegramInlineKeyboard {
  inline_keyboard: TelegramInlineButton[][];
}

export interface TelegramSendMessageInput {
  chatId: string;
  text: string;
  replyMarkup?: TelegramInlineKeyboard;
}

function getTelegramBotToken() {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN environment variable is required");
  }

  return token;
}

async function callTelegramApi<T>(method: string, body: Record<string, unknown>, context?: TraceContext): Promise<T> {
  const timer = startTimer();

  try {
    const response = await fetch(`${TELEGRAM_API_BASE}/bot${getTelegramBotToken()}/${method}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      emitMetric("telegram_api_latency_ms", timer.elapsedMs(), {
        service: "telegram",
        operation: method,
        outcome: "error",
      }, context);
      throw new Error(`Telegram API error: ${response.status} ${errorText}`);
    }

    const json = await response.json() as T;

    emitMetric("telegram_api_latency_ms", timer.elapsedMs(), {
      service: "telegram",
      operation: method,
      outcome: "success",
    }, context);
    logInfo("Telegram API call completed", {
      service: "telegram",
      operation: method,
      outcome: "success",
      duration_ms: timer.elapsedMs(),
    }, context);

    return json;
  } catch (error) {
    logError("Telegram API call failed", error, {
      service: "telegram",
      operation: method,
      outcome: "error",
      duration_ms: timer.elapsedMs(),
    }, context);
    throw error;
  }
}

export async function sendTelegramMessage(input: TelegramSendMessageInput, context?: TraceContext) {
  return callTelegramApi("sendMessage", {
    chat_id: input.chatId,
    text: input.text,
    reply_markup: input.replyMarkup,
  }, context);
}

export async function answerTelegramCallbackQuery(callbackQueryId: string, text?: string, context?: TraceContext) {
  return callTelegramApi("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text,
  }, context);
}
