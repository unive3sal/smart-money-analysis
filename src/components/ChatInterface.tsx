"use client";

import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ModelSelector } from "./ModelSelector";
import { Send, Bot, User, Loader2, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";

interface Message {
  role: "user" | "assistant";
  content: string;
  toolsUsed?: string[];
  timestamp: number;
}

interface StreamEvent {
  type: "content" | "tool_start" | "tool_end" | "done" | "error";
  content?: string;
  toolName?: string;
  toolsUsed?: string[];
  error?: string;
}

interface ChatInterfaceProps {
  initialPrompt?: string;
  className?: string;
}

export function ChatInterface({ initialPrompt, className }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState(initialPrompt || "");
  const [loading, setLoading] = useState(false);
  const [modelId, setModelId] = useState("gpt-4o");
  const [streamingContent, setStreamingContent] = useState("");
  const [activeTools, setActiveTools] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingContent]);


  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMessage: Message = {
      role: "user",
      content: input.trim(),
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);
    setStreamingContent("");
    setActiveTools([]);

    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId,
          messages: [...messages, userMessage].map((m) => ({
            role: m.role,
            content: m.content,
          })),
          stream: true,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }

      if (!response.body) {
        throw new Error("No response body");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accumulatedContent = "";
      let toolsUsed: string[] = [];

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
              const event: StreamEvent = JSON.parse(trimmed.slice(6));

              switch (event.type) {
                case "content":
                  if (event.content) {
                    accumulatedContent += event.content;
                    setStreamingContent(accumulatedContent);
                  }
                  break;

                case "tool_start":
                  if (event.toolName) {
                    setActiveTools((prev) => [...prev, event.toolName!]);
                  }
                  break;

                case "tool_end":
                  if (event.toolName) {
                    setActiveTools((prev) => prev.filter((t) => t !== event.toolName));
                    if (!toolsUsed.includes(event.toolName)) {
                      toolsUsed.push(event.toolName);
                    }
                  }
                  break;

                case "done":
                  if (event.toolsUsed) {
                    toolsUsed = event.toolsUsed;
                  }
                  break;

                case "error":
                  throw new Error(event.error || "Unknown streaming error");
              }
            } catch (e) {
              if (e instanceof SyntaxError) {
                continue;
              }
              throw e;
            }
          }
        }
      }

      const assistantMessage: Message = {
        role: "assistant",
        content: accumulatedContent,
        toolsUsed: toolsUsed.length > 0 ? toolsUsed : undefined,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
      setStreamingContent("");
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        return;
      }

      const errorMessage: Message = {
        role: "assistant",
        content: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
      setStreamingContent("");
      setActiveTools([]);
      abortControllerRef.current = null;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const suggestedPrompts = [
    "Show the top Polymarket traders right now",
    "Create a copy trade task for Election Whale with 250 USDC",
    "Inspect my copy trade task performance",
    "Give me AI analysis for the ETH 5k Polymarket market",
  ];

  return (
    <Card
      className={cn(
        "flex min-h-[520px] flex-col overflow-hidden rounded-[28px] border-white/10 bg-white/[0.035] shadow-[0_22px_80px_rgba(0,0,0,0.25)] lg:min-h-[620px]",
        className
      )}
    >
      <CardHeader className="flex flex-row items-center justify-between border-b border-white/10 bg-white/[0.03] px-5 py-4">
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-5 w-5" />
          Smart Money Assistant
        </CardTitle>
        <ModelSelector value={modelId} onChange={setModelId} />
      </CardHeader>

      <CardContent className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
        {messages.length === 0 && !streamingContent ? (
          <div className="flex h-full flex-col items-center justify-center rounded-[24px] border border-dashed border-white/10 bg-white/[0.02] px-6 py-10 text-center">
            <Bot className="mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="mb-2 text-lg font-semibold">Polymarket Copytrade Assistant</h3>
            <p className="mb-6 max-w-md text-sm leading-6 text-muted-foreground">
              Ask about top traders, copy trade tasks, Polymarket markets,
              and TimesNet-filtered market analysis.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {suggestedPrompts.map((prompt) => (
                <Button
                  key={prompt}
                  variant="outline"
                  size="sm"
                  className="rounded-full border-white/10 bg-white/[0.03]"
                  onClick={() => setInput(prompt)}
                >
                  {prompt}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex gap-3 ${
                  message.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                {message.role === "assistant" && (
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                )}

                <div
                  className={`max-w-[88%] rounded-2xl px-4 py-3 shadow-sm ${
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "border border-white/10 bg-white/[0.04]"
                  }`}
                >
                  <div className="whitespace-pre-wrap text-sm">{message.content}</div>

                  {message.toolsUsed && message.toolsUsed.length > 0 && (
                    <div className="flex gap-1 mt-2 flex-wrap">
                      {message.toolsUsed.map((tool) => (
                        <Badge key={tool} variant="secondary" className="text-xs">
                          <Wrench className="h-3 w-3 mr-1" />
                          {tool}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                {message.role === "user" && (
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary shadow-[0_0_20px_rgba(59,130,246,0.4)]">
                    <User className="h-4 w-4 text-primary-foreground" />
                  </div>
                )}
              </div>
            ))}

            {streamingContent && (
              <div className="flex gap-3 justify-start">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
                <div className="max-w-[88%] rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 shadow-sm">
                  <div className="whitespace-pre-wrap text-sm">{streamingContent}</div>
                  {activeTools.length > 0 && (
                    <div className="flex gap-1 mt-2 flex-wrap">
                      {activeTools.map((tool) => (
                        <Badge key={tool} variant="secondary" className="text-xs">
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          {tool}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </CardContent>

      <div className="border-t border-white/10 bg-white/[0.03] p-4">
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about traders, copy trade tasks, or Polymarket AI analysis..."
            disabled={loading}
            className="border-white/10 bg-background/70"
          />
          <Button onClick={sendMessage} disabled={loading || !input.trim()} className="rounded-xl px-4">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </Card>
  );
}
