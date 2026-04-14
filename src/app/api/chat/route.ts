import { NextRequest, NextResponse } from "next/server";
import { chat, chatStream, getAvailableModels, StreamEvent } from "@/agent";
import { ModelId } from "@/agent/providers/openaiProxy";
import {
  createTraceContext,
  emitMetric,
  logError,
  logInfo,
  startTimer,
} from "@/lib/observability";

export const runtime = "nodejs";
export const maxDuration = 60; // 60 seconds timeout

interface ChatRequestBody {
  modelId: ModelId;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export async function POST(request: NextRequest) {
  const traceId = request.headers.get("x-trace-id") || undefined;
  const requestId = request.headers.get("x-request-id") || undefined;
  const context = createTraceContext({
    traceId,
    requestId,
    channel: "chat_api",
  });
  const timer = startTimer();

  logInfo("Chat request started", {
    operation: "api_chat_post",
    path: request.nextUrl.pathname,
  }, context);

  try {
    const body: ChatRequestBody = await request.json();

    if (!body.modelId) {
      return NextResponse.json(
        { error: "modelId is required", meta: { traceId: context.traceId, requestId: context.requestId } },
        { status: 400 }
      );
    }

    if (!body.messages || body.messages.length === 0) {
      return NextResponse.json(
        { error: "messages array is required and must not be empty", meta: { traceId: context.traceId, requestId: context.requestId } },
        { status: 400 }
      );
    }

    if (body.stream) {
      const encoder = new TextEncoder();

      const stream = new ReadableStream({
        async start(controller) {
          try {
            const eventStream = chatStream(body.messages, {
              modelId: body.modelId,
              temperature: body.temperature,
              maxTokens: body.maxTokens,
            }, context);

            for await (const event of eventStream) {
              const data = `data: ${JSON.stringify(event)}\n\n`;
              controller.enqueue(encoder.encode(data));
            }

            emitMetric("api_chat_latency_ms", timer.elapsedMs(), {
              operation: "api_chat_post",
              outcome: "success",
              stream: true,
            }, context);
            logInfo("Chat stream completed", {
              operation: "api_chat_post",
              outcome: "success",
              duration_ms: timer.elapsedMs(),
              stream: true,
            }, context);
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          } catch (error) {
            emitMetric("api_chat_latency_ms", timer.elapsedMs(), {
              operation: "api_chat_post",
              outcome: "error",
              stream: true,
            }, context);
            logError("Chat stream failed", error, {
              operation: "api_chat_post",
              outcome: "error",
              duration_ms: timer.elapsedMs(),
              stream: true,
            }, context);
            const errorEvent: StreamEvent = {
              type: "error",
              error: error instanceof Error ? error.message : "Unknown error",
            };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorEvent)}\n\n`));
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
          "x-trace-id": context.traceId,
          "x-request-id": context.requestId || "",
        },
      });
    }

    const result = await chat(body.messages, {
      modelId: body.modelId,
      temperature: body.temperature,
      maxTokens: body.maxTokens,
    }, context);

    emitMetric("api_chat_latency_ms", timer.elapsedMs(), {
      operation: "api_chat_post",
      outcome: "success",
      stream: false,
    }, context);
    logInfo("Chat request completed", {
      operation: "api_chat_post",
      outcome: "success",
      duration_ms: timer.elapsedMs(),
      stream: false,
      tools_used: result.toolsUsed,
    }, context);

    return NextResponse.json({
      success: true,
      data: {
        content: result.content,
        toolsUsed: result.toolsUsed,
        usage: result.usage,
      },
      meta: {
        traceId: context.traceId,
        requestId: context.requestId,
      },
    });
  } catch (error) {
    emitMetric("api_chat_latency_ms", timer.elapsedMs(), {
      operation: "api_chat_post",
      outcome: "error",
      stream: false,
    }, context);
    logError("Chat API error", error, {
      operation: "api_chat_post",
      outcome: "error",
      duration_ms: timer.elapsedMs(),
      stream: false,
    }, context);

    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";

    return NextResponse.json(
      { success: false, error: errorMessage, meta: { traceId: context.traceId, requestId: context.requestId } },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const context = createTraceContext({
    traceId: request.headers.get("x-trace-id") || undefined,
    requestId: request.headers.get("x-request-id") || undefined,
    channel: "chat_api",
  });
  const timer = startTimer();

  try {
    const models = getAvailableModels();
    emitMetric("api_chat_models_latency_ms", timer.elapsedMs(), {
      operation: "api_chat_get_models",
      outcome: "success",
    }, context);
    logInfo("Get models request completed", {
      operation: "api_chat_get_models",
      outcome: "success",
      duration_ms: timer.elapsedMs(),
      model_count: models.length,
    }, context);
    return NextResponse.json({
      success: true,
      data: { models },
      meta: {
        traceId: context.traceId,
        requestId: context.requestId,
      },
    });
  } catch (error) {
    emitMetric("api_chat_models_latency_ms", timer.elapsedMs(), {
      operation: "api_chat_get_models",
      outcome: "error",
    }, context);
    logError("Get models error", error, {
      operation: "api_chat_get_models",
      outcome: "error",
      duration_ms: timer.elapsedMs(),
    }, context);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to get available models",
        meta: { traceId: context.traceId, requestId: context.requestId },
      },
      { status: 500 }
    );
  }
}
