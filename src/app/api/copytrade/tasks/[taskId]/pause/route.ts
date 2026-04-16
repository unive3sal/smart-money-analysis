import { NextRequest, NextResponse } from "next/server";
import { TaskStatus } from "@/backend/server/db/client";
import { requireSessionUser } from "@/backend/server/auth/session";
import { updateCopyTradeTaskStatus } from "@/backend/services/copytrade/tasks";

export async function POST(
  _request: NextRequest,
  { params }: { params: { taskId: string } }
) {
  try {
    const user = await requireSessionUser();
    const task = await updateCopyTradeTaskStatus(params.taskId, user.id, TaskStatus.PAUSED);
    return NextResponse.json({ success: true, data: task });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to pause task" },
      { status: 400 }
    );
  }
}
