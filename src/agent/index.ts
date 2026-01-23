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

const SYSTEM_PROMPT = `You are a Smart Money Analyst for Solana. You help users identify and analyze top-performing traders (smart money) and their trading patterns.

Your capabilities:
1. Fetch top traders by PnL for different timeframes
2. Analyze specific wallet addresses (holdings, transactions, patterns)
3. Extract structured features from wallets (trading behavior, performance, risk profile)
4. Get media sentiment for tokens (Twitter/social mentions, sentiment scores)
5. Calculate confidence scores for potential trades
6. Get token information and search for tokens
7. Find trending tokens

When analyzing wallets or tokens:
- Always use get_extracted_features for wallet analysis instead of dumping raw data
- Check media sentiment for additional context on tokens
- Calculate confidence scores before making trade recommendations
- Cite specific metrics when making recommendations

Be concise and data-driven. Focus on actionable insights.

Format currency as $X.XXK or $X.XXM for readability.
Format percentages with + or - signs.
Format wallet addresses as shortened form (first 4...last 4 chars).`;

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
  options: ChatOptions
): Promise<ChatResult> {
  const client = getProxyClient();
  const toolsUsed: string[] = [];

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

        console.log(`Executing tool: ${toolName}`, args);
        const result = await executeTool(toolName, args);

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
