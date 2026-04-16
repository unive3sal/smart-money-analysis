import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/backend/server/auth/session";
import { getCopyTradeTaskPerformance } from "@/backend/services/copytrade/tasks";

export async function GET(
  _request: NextRequest,
  { params }: { params: { taskId: string } }
) {
  try {
    const user = await requireSessionUser();
    const performance = await getCopyTradeTaskPerformance(params.taskId, user.id);
    return NextResponse.json({ success: true, data: performance });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to load performance" },
      { status: 404 }
    );
  }
}
