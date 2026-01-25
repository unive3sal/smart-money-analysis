import { NextRequest, NextResponse } from "next/server";
import { chat, chatStream, getAvailableModels, StreamEvent } from "@/agent";
import { ModelId } from "@/agent/providers/openaiProxy";

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
  try {
    const body: ChatRequestBody = await request.json();

    if (!body.modelId) {
      return NextResponse.json(
        { error: "modelId is required" },
        { status: 400 }
      );
    }

    if (!body.messages || body.messages.length === 0) {
      return NextResponse.json(
        { error: "messages array is required and must not be empty" },
        { status: 400 }
      );
    }

    // Handle streaming request
    if (body.stream) {
      const encoder = new TextEncoder();
      
      const stream = new ReadableStream({
        async start(controller) {
          try {
            const eventStream = chatStream(body.messages, {
              modelId: body.modelId,
              temperature: body.temperature,
              maxTokens: body.maxTokens,
            });

            for await (const event of eventStream) {
              const data = `data: ${JSON.stringify(event)}\n\n`;
              controller.enqueue(encoder.encode(data));
            }

            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          } catch (error) {
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
        },
      });
    }

    // Non-streaming request (original behavior)
    const result = await chat(body.messages, {
      modelId: body.modelId,
      temperature: body.temperature,
      maxTokens: body.maxTokens,
    });

    return NextResponse.json({
      success: true,
      data: {
        content: result.content,
        toolsUsed: result.toolsUsed,
        usage: result.usage,
      },
    });
  } catch (error) {
    console.error("Chat API error:", error);

    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const models = getAvailableModels();
    return NextResponse.json({ success: true, data: { models } });
  } catch (error) {
    console.error("Get models error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to get available models" },
      { status: 500 }
    );
  }
}
