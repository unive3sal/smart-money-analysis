import { db } from "@/backend/server/db/client";
import {
  registerTelegramActor,
  resolveActorContext,
  type ActorContext,
} from "@/backend/server/auth/actor";

export interface TelegramProfileInput {
  telegramUserId: string;
  chatId: string;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}

export async function getTelegramActorContext(input: TelegramProfileInput): Promise<ActorContext> {
  await registerTelegramActor(input);
  await db.upsertTelegramConversation({
    telegramUserId: input.telegramUserId,
    chatId: input.chatId,
    lastMessageAt: new Date().toISOString(),
  });

  const resolved = await resolveActorContext({
    channel: "telegram",
    telegramUserId: input.telegramUserId,
    chatId: input.chatId,
  });

  return {
    channel: "telegram",
    userId: resolved?.userId,
    telegramUserId: input.telegramUserId,
    chatId: input.chatId,
  };
}

export async function setTelegramConversationState(input: {
  telegramUserId: string;
  chatId: string;
  mode?: string;
  pendingActionType?: string | null;
  state?: Record<string, unknown> | null;
}) {
  return db.upsertTelegramConversation({
    telegramUserId: input.telegramUserId,
    chatId: input.chatId,
    mode: input.mode,
    pendingActionType: input.pendingActionType,
    stateJson: input.state ? JSON.stringify(input.state) : null,
    lastMessageAt: new Date().toISOString(),
  });
}

export async function getTelegramConversationState(telegramUserId: string, chatId: string) {
  const record = await db.findTelegramConversation(telegramUserId, chatId);

  return record
    ? {
        ...record,
        state: record.stateJson ? JSON.parse(record.stateJson) as Record<string, unknown> : null,
      }
    : null;
}
