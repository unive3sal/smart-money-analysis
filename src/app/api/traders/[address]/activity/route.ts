import { NextRequest, NextResponse } from "next/server";
import { getTraderActivity } from "@/services/polymarket/traders";

export async function GET(
  _request: NextRequest,
  { params }: { params: { address: string } }
) {
  const activity = await getTraderActivity(params.address);

  return NextResponse.json({
    success: true,
    data: activity,
  });
}
