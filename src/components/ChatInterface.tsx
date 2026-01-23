"use client";

import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ModelSelector } from "./ModelSelector";
import { Send, Bot, User, Loader2, Wrench } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
  toolsUsed?: string[];
  timestamp: number;
}

interface ChatInterfaceProps {
  initialPrompt?: string;
}

export function ChatInterface({ initialPrompt }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState(initialPrompt || "");
  const [loading, setLoading] = useState(false);
  const [modelId, setModelId] = useState("gpt-4o");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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
        }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to get response");
      }

      const assistantMessage: Message = {
        role: "assistant",
        content: data.data.content,
        toolsUsed: data.data.toolsUsed,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      const errorMessage: Message = {
        role: "assistant",
        content: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const suggestedPrompts = [
    "Who are the top traders this week?",
    "What tokens is smart money buying?",
    "Analyze the top trader's wallet",
    "What's trending on Solana right now?",
  ];

  return (
    <Card className="flex flex-col h-[600px]">
      <CardHeader className="flex flex-row items-center justify-between border-b">
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-5 w-5" />
          Smart Money Assistant
        </CardTitle>
        <ModelSelector value={modelId} onChange={setModelId} />
      </CardHeader>

      <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Bot className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="font-semibold mb-2">Smart Money Analysis</h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-md">
              Ask me about top traders, wallet analysis, token sentiment, or
              trading signals on Solana.
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              {suggestedPrompts.map((prompt) => (
                <Button
                  key={prompt}
                  variant="outline"
                  size="sm"
                  onClick={() => setInput(prompt)}
                >
                  {prompt}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message, index) => (
            <div
              key={index}
              className={`flex gap-3 ${
                message.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              {message.role === "assistant" && (
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
              )}
              <div
                className={`max-w-[80%] rounded-lg px-4 py-2 ${
                  message.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                }`}
              >
                <div className="whitespace-pre-wrap text-sm">
                  {message.content}
                </div>
                {message.toolsUsed && message.toolsUsed.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-border/50">
                    <Wrench className="h-3 w-3 text-muted-foreground" />
                    {message.toolsUsed.map((tool) => (
                      <Badge key={tool} variant="secondary" className="text-xs">
                        {tool.replace(/_/g, " ")}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
              {message.role === "user" && (
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                  <User className="h-4 w-4 text-primary-foreground" />
                </div>
              )}
            </div>
          ))
        )}

        {loading && (
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <Bot className="h-4 w-4 text-primary" />
            </div>
            <div className="bg-muted rounded-lg px-4 py-2">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </CardContent>

      <div className="p-4 border-t">
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about smart money, wallets, or tokens..."
            disabled={loading}
          />
          <Button onClick={sendMessage} disabled={loading || !input.trim()}>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </Card>
  );
}
