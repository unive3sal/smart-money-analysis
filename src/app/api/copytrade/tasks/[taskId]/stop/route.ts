import { NextRequest, NextResponse } from "next/server";
import { TaskStatus } from "@/server/db/client";
import { requireSessionUser } from "@/server/auth/session";
import { updateCopyTradeTaskStatus } from "@/services/copytrade/tasks";

export async function POST(
  request: NextRequest,
  { params }: { params: { taskId: string } }
) {
  try {
    const user = await requireSessionUser();
    const body = await request.json().catch(() => ({}));
    const task = await updateCopyTradeTaskStatus(
      params.taskId,
      user.id,
      TaskStatus.STOPPED,
      typeof body.reason === "string" ? body.reason : "Stopped by user"
    );
    return NextResponse.json({ success: true, data: task });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to stop task" },
      { status: 400 }
    );
  }
}
