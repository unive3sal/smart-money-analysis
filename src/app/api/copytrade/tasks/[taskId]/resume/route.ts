import { NextRequest, NextResponse } from "next/server";
import { TaskStatus } from "@/server/db/client";
import { requireSessionUser } from "@/server/auth/session";
import { updateCopyTradeTaskStatus } from "@/services/copytrade/tasks";

export async function POST(
  _request: NextRequest,
  { params }: { params: { taskId: string } }
) {
  try {
    const user = await requireSessionUser();
    const task = await updateCopyTradeTaskStatus(params.taskId, user.id, TaskStatus.ACTIVE);
    return NextResponse.json({ success: true, data: task });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to resume task" },
      { status: 400 }
    );
  }
}
