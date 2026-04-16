import { createTraceContext, logInfo, type TraceContext } from "@/backend/observability";
import { answerTelegramCallbackQuery, sendTelegramMessage } from "@/backend/services/telegram/client";
import { handleTelegramCommand } from "@/backend/services/telegram/commands";
import { getTelegramActorContext } from "@/backend/services/telegram/session";

interface TelegramUser {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
}

interface TelegramChat {
  id: number;
}

interface TelegramMessage {
  message_id: number;
  text?: string;
  from?: TelegramUser;
  chat: TelegramChat;
}

interface TelegramCallbackQuery {
  id: string;
  data?: string;
  from: TelegramUser;
  message?: TelegramMessage;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

function toTelegramProfile(user: TelegramUser, chatId: number) {
  return {
    telegramUserId: String(user.id),
    chatId: String(chatId),
    username: user.username || null,
    firstName: user.first_name || null,
    lastName: user.last_name || null,
  };
}

export async function handleTelegramUpdate(update: TelegramUpdate, context?: TraceContext) {
  if (update.message?.text && update.message.from) {
    const actor = await getTelegramActorContext(toTelegramProfile(update.message.from, update.message.chat.id));
    const actorContext = createTraceContext({
      traceId: context?.traceId,
      requestId: context?.requestId,
      channel: "telegram",
      actor: `telegram:${actor.telegramUserId}`,
      userId: actor.userId,
      telegramUserId: actor.telegramUserId,
      chatId: actor.chatId,
    });

    logInfo("Telegram message received", {
      service: "telegram",
      operation: "telegram_message",
      update_id: update.update_id,
    }, actorContext);

    const result = await handleTelegramCommand(update.message.text, actor, actorContext);

    for (const message of result.messages) {
      await sendTelegramMessage({
        chatId: actor.chatId!,
        text: message,
        replyMarkup: result.replyMarkup,
      }, actorContext);
    }

    return { ok: true };
  }

  if (update.callback_query?.from && update.callback_query.message?.chat.id) {
    const actor = await getTelegramActorContext(
      toTelegramProfile(update.callback_query.from, update.callback_query.message.chat.id),
    );
    const actorContext = createTraceContext({
      traceId: context?.traceId,
      requestId: context?.requestId,
      channel: "telegram",
      actor: `telegram:${actor.telegramUserId}`,
      userId: actor.userId,
      telegramUserId: actor.telegramUserId,
      chatId: actor.chatId,
    });

    await answerTelegramCallbackQuery(update.callback_query.id, "Working on it", actorContext);

    const commandMap: Record<string, string> = {
      wallet_status: "/wallet",
      top_traders: "/traders",
      markets: "/markets",
      tasks: "/tasks",
    };
    const callbackCommand = commandMap[update.callback_query.data || ""];

    if (callbackCommand) {
      const result = await handleTelegramCommand(callbackCommand, actor, actorContext);
      for (const message of result.messages) {
        await sendTelegramMessage({
          chatId: actor.chatId!,
          text: message,
          replyMarkup: result.replyMarkup,
        }, actorContext);
      }
    }

    return { ok: true };
  }

  return { ok: true, ignored: true };
}
