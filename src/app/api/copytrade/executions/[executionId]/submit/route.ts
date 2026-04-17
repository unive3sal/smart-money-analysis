import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSessionUser } from "@/backend/server/auth/session";
import { submitBrokeredExecution } from "@/backend/services/copytrade/executions";

const requestSchema = z.object({
  signedOrder: z.record(z.any()).nullable().optional(),
  transactionHash: z.string().nullable().optional(),
  orderId: z.string().nullable().optional(),
  venueStatus: z.string().nullable().optional(),
  executedPrice: z.number().nullable().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: { executionId: string } }
) {
  try {
    const user = await requireSessionUser();
    const body = requestSchema.parse(await request.json());
    const execution = await submitBrokeredExecution({
      executionId: params.executionId,
      userId: user.id,
      signedOrder: body.signedOrder || null,
      transactionHash: body.transactionHash || null,
      orderId: body.orderId || null,
      venueStatus: body.venueStatus || null,
      executedPrice: body.executedPrice ?? null,
    });
    return NextResponse.json({ success: true, data: execution });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to submit brokered execution" },
      { status: 400 }
    );
  }
}
