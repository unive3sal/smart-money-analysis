import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/backend/server/auth/session";
import { deleteCopyTradeTask, getCopyTradeTask } from "@/backend/services/copytrade/tasks";

export async function GET(
  _request: NextRequest,
  { params }: { params: { taskId: string } }
) {
  try {
    const user = await requireSessionUser();
    const task = await getCopyTradeTask(params.taskId, user.id);
    return NextResponse.json({ success: true, data: task });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to load task" },
      { status: 404 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { taskId: string } }
) {
  try {
    const user = await requireSessionUser();
    const result = await deleteCopyTradeTask(params.taskId, user.id);
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to delete task" },
      { status: 400 }
    );
  }
}
