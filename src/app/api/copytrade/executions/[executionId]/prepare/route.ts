import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/backend/server/auth/session";
import { prepareBrokeredExecution } from "@/backend/services/copytrade/executions";

export async function POST(
  _request: NextRequest,
  { params }: { params: { executionId: string } }
) {
  try {
    const user = await requireSessionUser();
    const payload = await prepareBrokeredExecution(params.executionId, user.id);
    return NextResponse.json({ success: true, data: payload });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to prepare brokered execution" },
      { status: 400 }
    );
  }
}
