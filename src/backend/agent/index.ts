/**
 * Smart Money Analysis Agent
 *
 * Uses OpenAI-compatible proxy for LLM calls with tool support
 */

import {
  getProxyClient,
  ChatMessage,
  ChatCompletionRequest,
  ModelId,
  AVAILABLE_MODELS,
  ToolCall,
} from "./providers/openaiProxy";
import { ALL_TOOLS } from "./tools";
import { executeTool, ToolName } from "./toolExecutor";
import { type ActorContext } from "@/backend/server/auth/actor";
import { buildIntentGateResponse, resolvePlatformIntent } from "./intentResolver";
import {
  emitMetric,
  logError,
  logInfo,
  startTimer,
  type TraceContext,
} from "@/backend/observability";

const SYSTEM_PROMPT = `You are a Polymarket copy-trading analyst and control assistant.

Your capabilities:
1. Inspect Polymarket market information and top trader activity
2. Summarize wallet authorization and vault readiness
3. Create, inspect, pause, resume, stop, and delete copy-trade tasks
4. Explain task performance metrics such as realized PnL, unrealized PnL, open positions, and win rate
5. Get TimesNet-based advisory market analysis used to filter copy-trade execution
6. Still support legacy token/media/CCXT tools when relevant

Scope rules:
- The app supports wallet authorization, trader discovery, task lifecycle management, and market analysis.
- Treat TimesNet outputs as an execution filter and advisory market signal, not the only reason to place a trade.
- For any task-changing or potentially money-moving action, be explicit about what changed and cite the configured controls.
- If live execution credentials are not configured, explain that the dashboard currently demonstrates the orchestration layer and API surface.

Tool selection guidance:
- For top traders or realtime activity: use get_top_polymarket_traders and get_trader_activity
- For task inspection or lifecycle changes: use the copy trade task tools
- For market questions: use get_polymarket_market_info and get_polymarket_market_analysis
- For wallet/vault readiness: use get_wallet_status
- For legacy token analysis: use the original CCXT/media/TimesNet tools

Always cite specific metrics, confidence values, and risk rails when discussing copy-trade tasks.`;

export interface ChatOptions {
  modelId: ModelId;
  temperature?: number;
  maxTokens?: number;
  actor?: ActorContext;
}

export interface ChatResult {
  content: string;
  toolsUsed: string[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
  };
}

export type StreamEvent =
  | { type: "content"; content: string }
  | { type: "tool_start"; toolName: string }
  | { type: "tool_end"; toolName: string; result: unknown }
  | { type: "done"; toolsUsed: string[] }
  | { type: "error"; error: string };

type ConversationMessage = Array<{ role: "user" | "assistant"; content: string }>;

interface IntentGateState {
  latestUserMessage: string;
  gatedResponse: string | null;
  intent: ReturnType<typeof resolvePlatformIntent>;
}

interface ToolExecutionConfig {
  actor?: ActorContext;
  context?: TraceContext;
  metricName: string;
  operation: string;
  startMessage: string;
  completedMessage: string;
}

function getLatestUserMessage(messages: ConversationMessage): string {
  return [...messages].reverse().find((message) => message.role === "user")?.content || "";
}

function resolveIntentGateState(messages: ConversationMessage): IntentGateState {
  const latestUserMessage = getLatestUserMessage(messages);
  const intent = resolvePlatformIntent(latestUserMessage);

  return {
    latestUserMessage,
    intent,
    gatedResponse: buildIntentGateResponse(intent),
  };
}

function buildChatMessages(messages: ConversationMessage): ChatMessage[] {
  return [
    { role: "system", content: SYSTEM_PROMPT },
    ...messages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
  ];
}

function createChatCompletionRequest(
  messages: ChatMessage[],
  options: ChatOptions
): ChatCompletionRequest {
  return {
    model: options.modelId,
    messages,
    tools: ALL_TOOLS,
    tool_choice: "auto",
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens ?? 2048,
  };
}

function parseToolArguments(argumentsJson: string): Record<string, unknown> {
  try {
    return JSON.parse(argumentsJson);
  } catch {
    return {};
  }
}

async function executeSingleToolCall(
  toolCall: ToolCall,
  chatMessages: ChatMessage[],
  config: ToolExecutionConfig
): Promise<{ toolName: string; result: Awaited<ReturnType<typeof executeTool>> }> {
  const toolName = toolCall.function.name as ToolName;

  logInfo(config.startMessage, {
    operation: config.operation,
    tool_name: toolName,
  }, config.context);

  const toolTimer = startTimer();
  const result = await executeTool(
    toolName,
    parseToolArguments(toolCall.function.arguments),
    config.context,
    config.actor
  );

  emitMetric(config.metricName, toolTimer.elapsedMs(), {
    operation: config.operation,
    tool_name: toolName,
    outcome: result.success ? "success" : "error",
  }, config.context);

  logInfo(config.completedMessage, {
    operation: config.operation,
    tool_name: toolName,
    duration_ms: toolTimer.elapsedMs(),
    outcome: result.success ? "success" : "error",
  }, config.context);

  chatMessages.push({
    role: "tool",
    tool_call_id: toolCall.id,
    content: JSON.stringify(result),
  });

  return { toolName, result };
}

async function executeToolCalls(
  toolCalls: ToolCall[],
  chatMessages: ChatMessage[],
  toolsUsed: string[],
  config: ToolExecutionConfig
): Promise<Array<{ toolName: string; result: Awaited<ReturnType<typeof executeTool>> }>> {
  const executedTools: Array<{ toolName: string; result: Awaited<ReturnType<typeof executeTool>> }> = [];

  for (const toolCall of toolCalls) {
    const toolName = toolCall.function.name as ToolName;
    toolsUsed.push(toolName);
    executedTools.push(await executeSingleToolCall(toolCall, chatMessages, config));
  }

  return executedTools;
}

function buildStreamToolCalls(toolCalls: ToolCall[]): ToolCall[] {
  return toolCalls.filter((toolCall): toolCall is ToolCall => Boolean(toolCall));
}

/**
 * Process a chat message with the smart money agent
 */
export async function chat(
  messages: ConversationMessage,
  options: ChatOptions,
  context?: TraceContext
): Promise<ChatResult> {
  const client = getProxyClient();
  const toolsUsed: string[] = [];
  const timer = startTimer();
  const { latestUserMessage, intent, gatedResponse } = resolveIntentGateState(messages);

  logInfo("Agent chat started", {
    operation: "agent_chat",
    message_count: messages.length,
    model_id: options.modelId,
    latest_user_message: latestUserMessage,
  }, context);

  if (gatedResponse) {
    emitMetric("agent_chat_latency_ms", timer.elapsedMs(), {
      operation: "agent_chat",
      outcome: intent.status,
    }, context);
    logInfo("Agent request gated", {
      operation: "agent_chat",
      outcome: intent.status,
      intent_type: intent.intentType,
    }, context);
    return {
      content: gatedResponse,
      toolsUsed: [],
    };
  }

  const chatMessages = buildChatMessages(messages);
  const MAX_ITERATIONS = 10;
  let iterations = 0;

  while (iterations < MAX_ITERATIONS) {
    iterations++;

    const response = await client.chatCompletion(createChatCompletionRequest(chatMessages, options));
    const choice = response.choices[0];

    if (!choice) {
      throw new Error("No response from model");
    }

    if (choice.finish_reason === "tool_calls" && choice.message.tool_calls) {
      chatMessages.push(choice.message);

      await executeToolCalls(choice.message.tool_calls, chatMessages, toolsUsed, {
        actor: options.actor,
        context,
        metricName: "agent_tool_latency_ms",
        operation: "agent_tool_execution",
        startMessage: "Agent tool execution started",
        completedMessage: "Agent tool execution completed",
      });

      continue;
    }

    emitMetric("agent_chat_latency_ms", timer.elapsedMs(), {
      operation: "agent_chat",
      outcome: "success",
    }, context);
    logInfo("Agent chat completed", {
      operation: "agent_chat",
      outcome: "success",
      duration_ms: timer.elapsedMs(),
      tools_used: [...new Set(toolsUsed)],
    }, context);
    return {
      content: choice.message.content || "",
      toolsUsed: [...new Set(toolsUsed)],
      usage: response.usage
        ? {
            promptTokens: response.usage.prompt_tokens,
            completionTokens: response.usage.completion_tokens,
          }
        : undefined,
    };
  }

  emitMetric("agent_chat_latency_ms", timer.elapsedMs(), {
    operation: "agent_chat",
    outcome: "error",
  }, context);
  logError("Agent chat exceeded maximum iterations", new Error("Maximum tool call iterations exceeded"), {
    operation: "agent_chat",
    outcome: "error",
    duration_ms: timer.elapsedMs(),
  }, context);
  throw new Error("Maximum tool call iterations exceeded");
}

/**
 * Get available models for the frontend
 */
export function getAvailableModels() {
  return AVAILABLE_MODELS.map((m) => ({
    id: m.id,
    name: m.name,
    provider: m.provider,
  }));
}

/**
 * Simple query without conversation history
 */
export async function query(
  prompt: string,
  options: ChatOptions
): Promise<ChatResult> {
  return chat([{ role: "user", content: prompt }], options);
}

/**
 * Process a chat message with streaming output
 */
export async function* chatStream(
  messages: ConversationMessage,
  options: ChatOptions,
  context?: TraceContext
): AsyncGenerator<StreamEvent, void, unknown> {
  const client = getProxyClient();
  const toolsUsed: string[] = [];
  const { intent, gatedResponse } = resolveIntentGateState(messages);

  if (gatedResponse) {
    logInfo("Agent request gated in stream", {
      operation: "agent_chat_stream",
      outcome: intent.status,
      intent_type: intent.intentType,
    }, context);
    yield { type: "content", content: gatedResponse };
    yield { type: "done", toolsUsed: [] };
    return;
  }

  const chatMessages = buildChatMessages(messages);
  const MAX_ITERATIONS = 10;
  let iterations = 0;

  while (iterations < MAX_ITERATIONS) {
    iterations++;

    let contentBuffer = "";
    const streamedToolCalls: ToolCall[] = [];
    let finishReason: string | null = null;

    for await (const chunk of client.chatCompletionStream(createChatCompletionRequest(chatMessages, options))) {
      const choice = chunk.choices[0];
      if (!choice) continue;

      if (choice.delta.content) {
        contentBuffer += choice.delta.content;
        yield { type: "content", content: choice.delta.content };
      }

      if (choice.delta.tool_calls) {
        for (const toolCallDelta of choice.delta.tool_calls) {
          const index = toolCallDelta.index;

          if (!streamedToolCalls[index]) {
            streamedToolCalls[index] = {
              id: toolCallDelta.id || "",
              type: "function",
              function: {
                name: toolCallDelta.function?.name || "",
                arguments: "",
              },
            };
          }

          if (toolCallDelta.id) {
            streamedToolCalls[index].id = toolCallDelta.id;
          }
          if (toolCallDelta.function?.name) {
            streamedToolCalls[index].function.name = toolCallDelta.function.name;
          }
          if (toolCallDelta.function?.arguments) {
            streamedToolCalls[index].function.arguments += toolCallDelta.function.arguments;
          }
        }
      }

      if (choice.finish_reason) {
        finishReason = choice.finish_reason;
      }
    }

    const toolCalls = buildStreamToolCalls(streamedToolCalls);

    if (finishReason === "tool_calls" && toolCalls.length > 0) {
      chatMessages.push({
        role: "assistant",
        content: contentBuffer || "",
        tool_calls: toolCalls,
      });

      for (const toolCall of toolCalls) {
        const toolName = toolCall.function.name as ToolName;
        toolsUsed.push(toolName);
        yield { type: "tool_start", toolName };

        const { result } = await executeSingleToolCall(toolCall, chatMessages, {
          actor: options.actor,
          context,
          metricName: "agent_tool_stream_latency_ms",
          operation: "agent_tool_execution_stream",
          startMessage: "Agent stream tool execution started",
          completedMessage: "Agent stream tool execution completed",
        });

        yield { type: "tool_end", toolName, result };
      }

      continue;
    }

    yield { type: "done", toolsUsed: [...new Set(toolsUsed)] };
    return;
  }

  yield { type: "error", error: "Maximum tool call iterations exceeded" };
}
