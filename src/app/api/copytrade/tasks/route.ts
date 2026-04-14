import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AnalysisSignal, WalletChain } from "@/server/db/client";
import { requireSessionUser } from "@/server/auth/session";
import { createCopyTradeTask, listCopyTradeTasks } from "@/services/copytrade/tasks";

const createTaskSchema = z.object({
  walletConnectionId: z.string().optional(),
  tradingVaultId: z.string().optional(),
  traderAddress: z.string().min(4),
  traderChain: z.nativeEnum(WalletChain).default(WalletChain.EVM),
  name: z.string().min(3),
  allocationUsd: z.number().positive(),
  takeProfitPercent: z.number().positive().optional(),
  stopLossPercent: z.number().positive().optional(),
  maxSlippageBps: z.number().int().positive().max(1000).optional(),
  timesnetEnabled: z.boolean().optional(),
  timesnetMinimumConfidence: z.number().min(0).max(1).optional(),
  timesnetRequiredSignal: z.nativeEnum(AnalysisSignal).optional(),
  notes: z.string().optional(),
});

export async function GET() {
  try {
    const user = await requireSessionUser();
    const tasks = await listCopyTradeTasks(user.id);
    return NextResponse.json({ success: true, data: tasks });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to load tasks" },
      { status: 401 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const body = createTaskSchema.parse(await request.json());
    const task = await createCopyTradeTask({
      userId: user.id,
      ...body,
    });

    return NextResponse.json({ success: true, data: task });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to create task" },
      { status: 400 }
    );
  }
}
