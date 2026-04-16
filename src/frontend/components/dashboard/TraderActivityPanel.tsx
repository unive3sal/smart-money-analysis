"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, Loader2, Trophy } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/frontend/components/ui/card";
import { Badge } from "@/frontend/components/ui/badge";
import { Button } from "@/frontend/components/ui/button";
import { formatAddress, formatCurrency, formatPercent } from "@/frontend/lib/utils";

interface Trader {
  address: string;
  displayName: string;
  avatarUrl?: string;
  realizedPnl: number;
  unrealizedPnl: number;
  winRate: number;
  totalTrades: number;
  activityScore: number;
  copiedByTasks: number;
}

interface ActivityEvent {
  id: string;
  traderAddress: string;
  marketId: string;
  tokenId: string;
  side: "BUY" | "SELL";
  outcome: string;
  price: number;
  size: number;
  transactionHash?: string;
  timestamp: string;
  question: string;
}

export function TraderActivityPanel() {
  const [traders, setTraders] = useState<Trader[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const loadLeaderboard = useCallback(async () => {
    const tradersResponse = await fetch("/api/traders?limit=8", { cache: "no-store" });
    const tradersPayload = await tradersResponse.json();
    const loadedTraders = tradersPayload.data as Trader[];
    setTraders(loadedTraders);

    const address = selectedAddress || loadedTraders[0]?.address;
    if (address) {
      setSelectedAddress(address);
      const activityResponse = await fetch(`/api/traders/${address}/activity`, { cache: "no-store" });
      const activityPayload = await activityResponse.json();
      setActivity(activityPayload.data || []);
    }
  }, [selectedAddress]);

  useEffect(() => {
    loadLeaderboard().finally(() => setLoading(false));
  }, [loadLeaderboard]);

  async function selectTrader(address: string) {
    setSelectedAddress(address);
    const response = await fetch(`/api/traders/${address}/activity`, { cache: "no-store" });
    const payload = await response.json();
    setActivity(payload.data || []);
  }

  return (
    <Card className="rounded-[28px] border-white/10 bg-white/[0.035] shadow-[0_20px_60px_rgba(0,0,0,0.2)]">
      <CardHeader className="border-b border-white/10 pb-5">
        <CardTitle className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-primary" />
          Top traders & live activity
        </CardTitle>
        <CardDescription>
          Watch high-performing Polymarket traders and their latest fills to choose copytrade sources.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 xl:grid-cols-[1.15fr_1fr]">
        <div className="space-y-3">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading top traders...
            </div>
          ) : (
            traders.map((trader, index) => (
              <button
                key={trader.address}
                type="button"
                onClick={() => selectTrader(trader.address)}
                className={`w-full rounded-[24px] border p-4 text-left transition ${selectedAddress === trader.address ? "border-primary bg-primary/8 shadow-[0_0_24px_rgba(59,130,246,0.15)]" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">#{index + 1}</Badge>
                      <span className="font-semibold">{trader.displayName}</span>
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">{formatAddress(trader.address, 6)}</div>
                  </div>
                  <Badge>{trader.activityScore.toFixed(0)} activity</Badge>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-4">
                  <div>
                    <div className="text-xs text-muted-foreground">Realized PnL</div>
                    <div className="font-medium">{formatCurrency(trader.realizedPnl)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Win rate</div>
                    <div className="font-medium">{formatPercent(trader.winRate)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Trades</div>
                    <div className="font-medium">{trader.totalTrades}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Followers</div>
                    <div className="font-medium">{trader.copiedByTasks}</div>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        <div className="space-y-3 rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
          <div className="flex items-center gap-2 font-semibold">
            <Activity className="h-4 w-4 text-primary" />
            Real-time activity feed
          </div>
          <div className="text-sm text-muted-foreground">
            Latest observed actions for {selectedAddress ? formatAddress(selectedAddress, 6) : "the selected trader"}.
          </div>
          <div className="space-y-3">
            {activity.map((event) => (
              <div key={event.id} className="rounded-2xl border border-white/10 bg-background/80 p-3">
                <div className="flex items-center justify-between gap-3">
                  <Badge variant={event.side === "BUY" ? "default" : "secondary"}>{event.side}</Badge>
                  <span className="text-xs text-muted-foreground">{new Date(event.timestamp).toLocaleString()}</span>
                </div>
                <div className="mt-2 font-medium">{event.question}</div>
                <div className="mt-2 text-sm text-muted-foreground">
                  {event.outcome} @ {(event.price * 100).toFixed(1)}¢ · {event.size} shares
                </div>
              </div>
            ))}
            {activity.length === 0 && (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                No trader activity available yet.
              </div>
            )}
          </div>
          <Button variant="outline" onClick={() => selectedAddress && selectTrader(selectedAddress)} disabled={!selectedAddress}>
            Refresh activity
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
