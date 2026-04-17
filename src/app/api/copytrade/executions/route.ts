import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ExecutionStatus } from "@/backend/server/db/client";
import { requireSessionUser } from "@/backend/server/auth/session";
import { listBrokeredExecutions } from "@/backend/services/copytrade/executions";

const statusSchema = z.nativeEnum(ExecutionStatus).optional();

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const rawStatus = request.nextUrl.searchParams.get("status") || undefined;
    const status = rawStatus ? statusSchema.parse(rawStatus.toUpperCase()) : undefined;
    const executions = await listBrokeredExecutions(user.id, status);
    return NextResponse.json({ success: true, data: executions });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to load brokered executions" },
      { status: 400 }
    );
  }
}
