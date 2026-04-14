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
} from "./providers/openaiProxy";
import { ALL_TOOLS } from "./tools";
import { executeTool, ToolName } from "./toolExecutor";
import { buildIntentGateResponse, resolvePlatformIntent } from "./intentResolver";
import {
  emitMetric,
  logError,
  logInfo,
  startTimer,
  type TraceContext,
} from "@/lib/observability";

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
}

export interface ChatResult {
  content: string;
  toolsUsed: string[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
  };
}

/**
 * Process a chat message with the smart money agent
 */
export async function chat(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  options: ChatOptions,
  context?: TraceContext
): Promise<ChatResult> {
  const client = getProxyClient();
  const toolsUsed: string[] = [];
  const timer = startTimer();
  const latestUserMessage = [...messages].reverse().find((message) => message.role === "user")?.content || "";
  const intent = resolvePlatformIntent(latestUserMessage);
  const gatedResponse = buildIntentGateResponse(intent);

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

  // Build initial messages array
  const chatMessages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...messages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  ];

  // Maximum tool call iterations to prevent infinite loops
  const MAX_ITERATIONS = 10;
  let iterations = 0;

  while (iterations < MAX_ITERATIONS) {
    iterations++;

    const request: ChatCompletionRequest = {
      model: options.modelId,
      messages: chatMessages,
      tools: ALL_TOOLS,
      tool_choice: "auto",
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 2048,
    };

    const response = await client.chatCompletion(request);
    const choice = response.choices[0];

    if (!choice) {
      throw new Error("No response from model");
    }

    // Check if the model wants to use tools
    if (choice.finish_reason === "tool_calls" && choice.message.tool_calls) {
      // Add assistant message with tool calls
      chatMessages.push(choice.message);

      // Execute each tool call
      for (const toolCall of choice.message.tool_calls) {
        const toolName = toolCall.function.name as ToolName;
        toolsUsed.push(toolName);

        let args: Record<string, unknown>;
        try {
          args = JSON.parse(toolCall.function.arguments);
        } catch {
          args = {};
        }

        logInfo("Agent tool execution started", {
          operation: "agent_tool_execution",
          tool_name: toolName,
        }, context);
        const toolTimer = startTimer();
        const result = await executeTool(toolName, args, context);
        emitMetric("agent_tool_latency_ms", toolTimer.elapsedMs(), {
          operation: "agent_tool_execution",
          tool_name: toolName,
          outcome: result.success ? "success" : "error",
        }, context);
        logInfo("Agent tool execution completed", {
          operation: "agent_tool_execution",
          tool_name: toolName,
          duration_ms: toolTimer.elapsedMs(),
          outcome: result.success ? "success" : "error",
        }, context);

        // Add tool result to messages
        chatMessages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      }

      // Continue the loop to get the model's response after tool execution
      continue;
    }

    // Model finished without tool calls - return the response
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
      toolsUsed: [...new Set(toolsUsed)], // Deduplicate
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
 * Streaming event types
 */
export type StreamEvent =
  | { type: "content"; content: string }
  | { type: "tool_start"; toolName: string }
  | { type: "tool_end"; toolName: string; result: unknown }
  | { type: "done"; toolsUsed: string[] }
  | { type: "error"; error: string };

/**
 * Process a chat message with streaming output
 */
export async function* chatStream(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  options: ChatOptions,
  context?: TraceContext
): AsyncGenerator<StreamEvent, void, unknown> {
  const client = getProxyClient();
  const toolsUsed: string[] = [];
  const latestUserMessage = [...messages].reverse().find((message) => message.role === "user")?.content || "";
  const intent = resolvePlatformIntent(latestUserMessage);
  const gatedResponse = buildIntentGateResponse(intent);

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

  // Build initial messages array
  const chatMessages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...messages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  ];

  const MAX_ITERATIONS = 10;
  let iterations = 0;

  while (iterations < MAX_ITERATIONS) {
    iterations++;

    const request: ChatCompletionRequest = {
      model: options.modelId,
      messages: chatMessages,
      tools: ALL_TOOLS,
      tool_choice: "auto",
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 2048,
    };

    // Accumulate the response
    let contentBuffer = "";
    let toolCallsBuffer: {
      id: string;
      name: string;
      arguments: string;
    }[] = [];
    let finishReason: string | null = null;

    // Stream the response
    for await (const chunk of client.chatCompletionStream(request)) {
      const choice = chunk.choices[0];
      if (!choice) continue;

      // Handle content delta
      if (choice.delta.content) {
        contentBuffer += choice.delta.content;
        yield { type: "content", content: choice.delta.content };
      }

      // Handle tool calls delta
      if (choice.delta.tool_calls) {
        for (const toolCallDelta of choice.delta.tool_calls) {
          const index = toolCallDelta.index;
          
          // Initialize tool call if needed
          if (!toolCallsBuffer[index]) {
            toolCallsBuffer[index] = {
              id: toolCallDelta.id || "",
              name: toolCallDelta.function?.name || "",
              arguments: "",
            };
          }

          // Accumulate function name and arguments
          if (toolCallDelta.id) {
            toolCallsBuffer[index].id = toolCallDelta.id;
          }
          if (toolCallDelta.function?.name) {
            toolCallsBuffer[index].name = toolCallDelta.function.name;
          }
          if (toolCallDelta.function?.arguments) {
            toolCallsBuffer[index].arguments += toolCallDelta.function.arguments;
          }
        }
      }

      if (choice.finish_reason) {
        finishReason = choice.finish_reason;
      }
    }

    // Handle tool calls
    if (finishReason === "tool_calls" && toolCallsBuffer.length > 0) {
      // Add assistant message with tool calls to history
      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: contentBuffer || "",
        tool_calls: toolCallsBuffer.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: {
            name: tc.name,
            arguments: tc.arguments,
          },
        })),
      };
      chatMessages.push(assistantMessage);

      // Execute each tool call
      for (const toolCall of toolCallsBuffer) {
        const toolName = toolCall.name as ToolName;
        toolsUsed.push(toolName);

        yield { type: "tool_start", toolName };

        let args: Record<string, unknown>;
        try {
          args = JSON.parse(toolCall.arguments);
        } catch {
          args = {};
        }

        logInfo("Agent stream tool execution started", {
          operation: "agent_tool_execution_stream",
          tool_name: toolName,
        }, context);
        const toolTimer = startTimer();
        const result = await executeTool(toolName, args, context);
        emitMetric("agent_tool_stream_latency_ms", toolTimer.elapsedMs(), {
          operation: "agent_tool_execution_stream",
          tool_name: toolName,
          outcome: result.success ? "success" : "error",
        }, context);
        logInfo("Agent stream tool execution completed", {
          operation: "agent_tool_execution_stream",
          tool_name: toolName,
          duration_ms: toolTimer.elapsedMs(),
          outcome: result.success ? "success" : "error",
        }, context);

        yield { type: "tool_end", toolName, result };

        // Add tool result to messages
        chatMessages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      }

      // Continue loop to get model response after tool execution
      continue;
    }

    // Model finished - we're done
    yield { type: "done", toolsUsed: [...new Set(toolsUsed)] };
    return;
  }

  yield { type: "error", error: "Maximum tool call iterations exceeded" };
}
