/**
 * Custom OpenAI-compatible proxy adapter for Genkit
 * Supports dynamic model selection via your proxy URL
 */

export interface ProxyConfig {
  proxyUrl: string;
  proxyToken: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  tool_choice?: "auto" | "none" | { type: "function"; function: { name: string } };
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

export interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    message: ChatMessage;
    finish_reason: "stop" | "tool_calls" | "length";
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface ChatCompletionChunk {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  choices: {
    index: number;
    delta: {
      role?: "assistant";
      content?: string;
      tool_calls?: {
        index: number;
        id?: string;
        type?: "function";
        function?: {
          name?: string;
          arguments?: string;
        };
      }[];
    };
    finish_reason: "stop" | "tool_calls" | "length" | null;
  }[];
}

/**
 * OpenAI-compatible proxy client
 */
export class OpenAIProxyClient {
  private config: ProxyConfig;

  constructor(config: ProxyConfig) {
    this.config = config;
  }

  private getEndpoint(): string {
    const baseUrl = this.config.proxyUrl.replace(/\/+$/, ""); // Remove trailing slashes
    return baseUrl.includes("/v1/chat/completions") 
      ? baseUrl 
      : `${baseUrl}/v1/chat/completions`;
  }

  async chatCompletion(
    request: ChatCompletionRequest
  ): Promise<ChatCompletionResponse> {
    const endpoint = this.getEndpoint();
    console.log(`[LLM Proxy] Requesting: ${endpoint}`);
    
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.proxyToken}`,
      },
      body: JSON.stringify({ ...request, stream: false }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Proxy API error: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    return response.json();
  }

  async *chatCompletionStream(
    request: ChatCompletionRequest
  ): AsyncGenerator<ChatCompletionChunk, void, unknown> {
    const endpoint = this.getEndpoint();
    console.log(`[LLM Proxy] Streaming request: ${endpoint}`);
    
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.proxyToken}`,
      },
      body: JSON.stringify({ ...request, stream: true }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Proxy API error: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    if (!response.body) {
      throw new Error("No response body for streaming");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === "data: [DONE]") continue;
          if (trimmed.startsWith("data: ")) {
            try {
              const chunk: ChatCompletionChunk = JSON.parse(trimmed.slice(6));
              yield chunk;
            } catch {
              // Skip malformed JSON
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}

// Available models (can be extended)
export const AVAILABLE_MODELS = [
  { id: "gpt-4o", name: "GPT-4o", provider: "openai" },
  { id: "gpt-4o-mini", name: "GPT-4o Mini", provider: "openai" },
  { id: "gpt-4-turbo", name: "GPT-4 Turbo", provider: "openai" },
  { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet", provider: "anthropic" },
  { id: "claude-3-haiku-20240307", name: "Claude 3 Haiku", provider: "anthropic" },
  { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro", provider: "google" },
  { id: "gemini-1.5-flash", name: "Gemini 1.5 Flash", provider: "google" },
] as const;

export type ModelId = (typeof AVAILABLE_MODELS)[number]["id"];

// Singleton client instance
let proxyClient: OpenAIProxyClient | null = null;

export function getProxyClient(): OpenAIProxyClient {
  if (!proxyClient) {
    const proxyUrl = process.env.LLM_PROXY_URL;
    const proxyToken = process.env.LLM_PROXY_TOKEN;

    if (!proxyUrl || !proxyToken) {
      throw new Error(
        "LLM_PROXY_URL and LLM_PROXY_TOKEN environment variables are required"
      );
    }

    proxyClient = new OpenAIProxyClient({ proxyUrl, proxyToken });
  }
  return proxyClient;
}
