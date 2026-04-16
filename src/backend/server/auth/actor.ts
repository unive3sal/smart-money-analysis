import { getSessionUser } from "@/backend/server/auth/session";
import { db, type WalletChain, type WalletProvider } from "@/backend/server/db/client";
import { createTraceContext, type TraceContext } from "@/backend/observability";

export type ActorChannel = "web" | "telegram";

export interface ActorContext {
  channel: ActorChannel;
  userId?: string;
  telegramUserId?: string;
  chatId?: string;
}

export interface ResolvedActor {
  channel: ActorChannel;
  userId: string;
  telegramUserId?: string;
  chatId?: string;
}

export interface TelegramIdentityInput {
  telegramUserId: string;
  chatId: string;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}

export async function resolveActorContext(actor?: ActorContext): Promise<ResolvedActor | null> {
  if (actor?.userId) {
    return {
      channel: actor.channel,
      userId: actor.userId,
      telegramUserId: actor.telegramUserId,
      chatId: actor.chatId,
    };
  }

  if (actor?.channel === "telegram" && actor.telegramUserId) {
    const account = await db.findTelegramAccountByTelegramUserId(actor.telegramUserId);
    if (!account?.userId) {
      return null;
    }

    return {
      channel: "telegram",
      userId: account.userId,
      telegramUserId: account.telegramUserId,
      chatId: actor.chatId || account.chatId,
    };
  }

  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return null;
  }

  return {
    channel: "web",
    userId: sessionUser.id,
  };
}

export async function requireActorUser(actor?: ActorContext): Promise<ResolvedActor> {
  const resolved = await resolveActorContext(actor);
  if (!resolved) {
    throw new Error(actor?.channel === "telegram"
      ? "Telegram account is not linked or authorized yet. Use /start to set up custody first."
      : "Wallet session required. Connect a wallet from the dashboard first.");
  }

  return resolved;
}

export async function registerTelegramActor(input: TelegramIdentityInput) {
  return db.upsertTelegramAccount({
    telegramUserId: input.telegramUserId,
    chatId: input.chatId,
    username: input.username,
    firstName: input.firstName,
    lastName: input.lastName,
  });
}

export async function provisionTelegramUser(input: TelegramIdentityInput & {
  walletAddress: string;
  chain: WalletChain;
  provider: WalletProvider;
  label?: string;
}) {
  const account = await registerTelegramActor(input);
  const user = account.userId
    ? await db.findUserById(account.userId)
    : await db.createUser({
        primaryAddress: input.walletAddress,
        displayName: input.label || input.firstName || input.username || "Telegram Trader",
      });

  if (!user) {
    throw new Error("Failed to provision Telegram user");
  }

  await db.linkTelegramAccount(input.telegramUserId, user.id);

  return {
    user,
    telegramAccount: await db.upsertTelegramAccount({
      telegramUserId: input.telegramUserId,
      chatId: input.chatId,
      username: input.username,
      firstName: input.firstName,
      lastName: input.lastName,
      userId: user.id,
    }),
  };
}

export function toActorTraceContext(actor: ResolvedActor, base?: TraceContext): TraceContext {
  return createTraceContext({
    traceId: base?.traceId,
    requestId: base?.requestId,
    channel: actor.channel === "telegram" ? "telegram" : base?.channel || "web",
    actor: actor.channel === "telegram" ? `telegram:${actor.telegramUserId}` : actor.userId,
    userId: actor.userId,
    telegramUserId: actor.telegramUserId,
    chatId: actor.chatId,
  });
}
