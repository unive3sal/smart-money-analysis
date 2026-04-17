import { chat } from "@/backend/agent";
import { AVAILABLE_MODELS } from "@/backend/agent/providers/openaiProxy";
import { getMarketDataClient } from "@/backend/services/marketData";
import { getMarketAnalysis } from "@/backend/services/analysis/marketAnalysis";
import { getPolymarketMarket, listPolymarketMarkets } from "@/backend/services/polymarket/markets";
import { getTopPolymarketTraders, getTraderActivity } from "@/backend/services/polymarket/traders";
import {
  createCopyTradeTask,
  deleteCopyTradeTask,
  getCopyTradeTask,
  getCopyTradeTaskPerformance,
  listCopyTradeTasks,
  updateCopyTradeTaskStatus,
} from "@/backend/services/copytrade/tasks";
import {
  AnalysisSignal,
  TaskStatus,
  WalletChain,
} from "@/backend/server/db/client";
import type { ActorContext } from "@/backend/server/auth/actor";
import { requireActorUser } from "@/backend/server/auth/actor";
import { getTelegramCustodySummary, setupTelegramCustody } from "@/backend/services/telegram/custody";
import { chunkTelegramMessage, singleColumnKeyboard } from "@/backend/services/telegram/formatters";
import { setTelegramConversationState } from "@/backend/services/telegram/session";
import type { TraceContext } from "@/backend/observability";

function parseCommand(text: string) {
  const [command, ...rest] = text.trim().split(/\s+/);
  return {
    command: command.toLowerCase(),
    args: rest,
  };
}

function formatTaskSummary(task: Awaited<ReturnType<typeof listCopyTradeTasks>>[number]) {
  return [
    `Task: ${task.name}`,
    `ID: ${task.id}`,
    `Trader: ${task.traderAddress}`,
    `Status: ${task.status}`,
    `Allocation: $${task.allocationUsd.toFixed(2)}`,
    `TP/SL: ${task.takeProfitPercent ?? "-"}% / ${task.stopLossPercent ?? "-"}%`,
    `Open positions: ${task.openPositions}`,
    `PnL: realized $${task.realizedPnl.toFixed(2)}, unrealized $${task.unrealizedPnl.toFixed(2)}`,
  ].join("\n");
}

export async function handleTelegramCommand(
  text: string,
  actor: ActorContext,
  context?: TraceContext,
) {
  const { command, args } = parseCommand(text);

  switch (command) {
    case "/start":
      return {
        messages: [
          "Smart Money Telegram bot is ready.",
          "Commands: /wallet, /vault <address>, /traders, /trader <address>, /markets, /market <id>, /analysis <id>, /tasks, /task <id>, /create_task <trader> <allocation> <name>, /pause_task <id>, /resume_task <id>, /stop_task <id>, /delete_task <id>, /ask <question>",
          "Use /vault <walletAddress> to provision Telegram-native custody in MVP advisory mode.",
        ],
        replyMarkup: singleColumnKeyboard([
          { text: "Wallet vault", callbackData: "wallet_status" },
          { text: "Top traders", callbackData: "top_traders" },
          { text: "Markets", callbackData: "markets" },
          { text: "Tasks", callbackData: "tasks" },
        ]),
      };

    case "/help":
      return {
        messages: [
          "Use /vault <walletAddress> to provision Telegram custody.",
          "Use /traders, /markets, /analysis <market>, and /ask <question> for research.",
          "Use /create_task, /pause_task, /resume_task, /stop_task, /delete_task for copy trade lifecycle control.",
        ],
      };

    case "/wallet": {
      const summary = await getTelegramCustodySummary(actor);
      return {
        messages: [
          `Wallets: ${summary.wallets.length}`,
          `Vaults: ${summary.vaults.length}`,
          `Telegram custody records: ${summary.custody.length}`,
          ...summary.custody.slice(0, 3).map((item) => `${item.label}: ${item.walletAddress} -> ${item.vaultAddress} (${item.status}, ${item.executionMode})`),
        ],
      };
    }

    case "/vault": {
      const walletAddress = args[0];
      if (!walletAddress) {
        return { messages: ["Usage: /vault <walletAddress> [evm|solana]"] };
      }

      const chain = args[1]?.toLowerCase() === "solana" ? WalletChain.SOLANA : WalletChain.EVM;
      const provisioned = await setupTelegramCustody({
        actor,
        walletAddress,
        chain,
      });

      return {
        messages: [
          `Custody provisioned for ${provisioned.walletConnection.address}.`,
          `Vault: ${provisioned.tradingVault.address}`,
          `Mode: ${provisioned.custody.executionMode}`,
          `Execution enabled: ${provisioned.custody.isExecutionEnabled ? "yes" : "no"}`,
          "This MVP labels Telegram-native custody as advisory/brokered until real execution primitives are added.",
        ],
      };
    }

    case "/traders": {
      const traders = await getTopPolymarketTraders(5);
      return {
        messages: [
          ...traders.map((trader, index) => `${index + 1}. ${trader.displayName} — win rate ${trader.winRate}% — realized PnL $${trader.realizedPnl.toFixed(0)}`),
        ],
      };
    }

    case "/trader": {
      const address = args[0];
      if (!address) {
        return { messages: ["Usage: /trader <address>"] };
      }

      const activity = await getTraderActivity(address);
      return {
        messages: [
          `Recent activity for ${address}:`,
          ...activity.slice(0, 5).map((item) => `${item.side} ${item.outcome} on ${item.question} at ${(item.price * 100).toFixed(1)}¢ size ${item.size}`),
        ],
      };
    }

    case "/markets": {
      const markets = await listPolymarketMarkets();
      return {
        messages: [
          ...markets.slice(0, 5).map((market) => `${market.marketId} — ${(market.lastPrice * 100).toFixed(1)}¢ — ${market.question}`),
        ],
      };
    }

    case "/market": {
      const marketId = args[0];
      if (!marketId) {
        return { messages: ["Usage: /market <marketId>"] };
      }

      const market = await getPolymarketMarket(marketId);
      return {
        messages: [
          market.question,
          `Price: ${(market.lastPrice * 100).toFixed(1)}¢`,
          `24h volume: $${market.volume24h.toLocaleString()}`,
          `Liquidity: $${market.liquidity.toLocaleString()}`,
          `Spread: ${(market.spread * 100).toFixed(1)}¢`,
        ],
      };
    }

    case "/analysis": {
      const target = args[0];
      if (!target) {
        return { messages: ["Usage: /analysis <marketId|symbol>"] };
      }

      try {
        const marketAnalysis = await getMarketAnalysis(target);
        return {
          messages: [
            marketAnalysis.question,
            `Signal: ${marketAnalysis.signal}`,
            `Confidence: ${(marketAnalysis.confidence * 100).toFixed(1)}%`,
            marketAnalysis.summary,
            marketAnalysis.recommendedAction,
          ],
        };
      } catch {
        const tokenInfo = await getMarketDataClient().getTokenInfo(target, context);
        return {
          messages: [
            `${tokenInfo.symbol} on ${tokenInfo.exchangeId}`,
            `Price: ${tokenInfo.price}`,
            `24h change: ${tokenInfo.priceChange24h.toFixed(2)}%`,
            `24h volume: ${tokenInfo.volume24h.toFixed(2)}`,
          ],
        };
      }
    }

    case "/tasks": {
      const resolved = await requireActorUser(actor);
      const tasks = await listCopyTradeTasks(resolved.userId);
      return {
        messages: tasks.length > 0 ? tasks.map(formatTaskSummary) : ["No copy-trade tasks yet."],
      };
    }

    case "/task": {
      const taskId = args[0];
      if (!taskId) {
        return { messages: ["Usage: /task <taskId>"] };
      }

      const resolved = await requireActorUser(actor);
      const [task, performance] = await Promise.all([
        getCopyTradeTask(taskId, resolved.userId),
        getCopyTradeTaskPerformance(taskId, resolved.userId),
      ]);
      return {
        messages: [
          formatTaskSummary(task),
          `Analyses attached: ${(performance as { analyses?: unknown[] }).analyses?.length || 0}`,
        ],
      };
    }

    case "/create_task": {
      if (args.length < 3) {
        return { messages: ["Usage: /create_task <traderAddress> <allocationUsd> <name words...> [stopLossPercent] [takeProfitPercent]"] };
      }

      const resolved = await requireActorUser(actor);
      const custody = await getTelegramCustodySummary(actor);
      const primaryCustody = custody.custody[0];
      const traderAddress = args[0];
      const allocationUsd = Number(args[1]);
      const stopLossPercent = args.length >= 5 ? Number(args[args.length - 2]) : 5;
      const takeProfitPercent = args.length >= 5 ? Number(args[args.length - 1]) : 12;
      const nameTokens = args.length >= 5 ? args.slice(2, -2) : args.slice(2);
      const displayName = nameTokens.join(" ") || `Follow ${traderAddress.slice(0, 6)}...${traderAddress.slice(-4)}`;

      if (!primaryCustody) {
        return { messages: ["Provision Telegram custody first with /vault <walletAddress>."] };
      }

      if (!Number.isFinite(allocationUsd) || allocationUsd <= 0) {
        return { messages: ["Allocation must be a positive number."] };
      }

      if (!Number.isFinite(stopLossPercent) || !Number.isFinite(takeProfitPercent)) {
        return { messages: ["Stop-loss and take-profit must be numeric percentages."] };
      }

      const task = await createCopyTradeTask({
        userId: resolved.userId,
        walletConnectionId: primaryCustody.walletConnectionId || undefined,
        tradingVaultId: primaryCustody.tradingVaultId || undefined,
        traderAddress,
        name: displayName,
        allocationUsd,
        stopLossPercent,
        takeProfitPercent,
        timesnetEnabled: true,
        timesnetMinimumConfidence: 0.55,
        timesnetRequiredSignal: AnalysisSignal.BUY,
      });

      await setTelegramConversationState({
        telegramUserId: actor.telegramUserId!,
        chatId: actor.chatId!,
        mode: "task_created",
        pendingActionType: null,
        state: { taskId: task.id },
      });

      return {
        messages: [
          "Copy-trade task created.",
          formatTaskSummary(task),
        ],
      };
    }

    case "/pause_task":
    case "/resume_task":
    case "/stop_task":
    case "/delete_task": {
      const taskId = args[0];
      if (!taskId) {
        return { messages: [`Usage: ${command} <taskId>`] };
      }

      const resolved = await requireActorUser(actor);

      if (command === "/pause_task") {
        const task = await updateCopyTradeTaskStatus(taskId, resolved.userId, TaskStatus.PAUSED, "Paused from Telegram");
        return { messages: [formatTaskSummary(task)] };
      }

      if (command === "/resume_task") {
        const task = await updateCopyTradeTaskStatus(taskId, resolved.userId, TaskStatus.ACTIVE, "Resumed from Telegram");
        return { messages: [formatTaskSummary(task)] };
      }

      if (command === "/stop_task") {
        const task = await updateCopyTradeTaskStatus(taskId, resolved.userId, TaskStatus.STOPPED, "Stopped from Telegram");
        return { messages: [formatTaskSummary(task)] };
      }

      await deleteCopyTradeTask(taskId, resolved.userId);
      return { messages: [`Deleted task ${taskId}.`] };
    }

    case "/ask": {
      const prompt = args.join(" ");
      if (!prompt) {
        return { messages: ["Usage: /ask <question>"] };
      }

      const result = await chat([
        { role: "user", content: prompt },
      ], {
        modelId: AVAILABLE_MODELS[0].id,
        actor,
      }, context);

      return {
        messages: chunkTelegramMessage(result.content),
      };
    }

    default: {
      if (text.startsWith("/")) {
        return { messages: ["Unknown command. Use /help."] };
      }

      const result = await chat([
        { role: "user", content: text },
      ], {
        modelId: AVAILABLE_MODELS[0].id,
        actor,
      }, context);

      return {
        messages: chunkTelegramMessage(result.content),
      };
    }
  }
}
