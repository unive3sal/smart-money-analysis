"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatAddress, formatCurrency, formatPercent } from "@/lib/utils";
import { RefreshCw, TrendingUp, TrendingDown, ExternalLink } from "lucide-react";

interface Trader {
  owner: string;
  volume: number;
  trade: number;
  tradeBuy: number;
  tradeSell: number;
  volumeBuy: number;
  volumeSell: number;
  tags: string[];
}

interface TraderLeaderboardProps {
  onSelectWallet?: (address: string) => void;
}

export function TraderLeaderboard({ onSelectWallet }: TraderLeaderboardProps) {
  const [traders, setTraders] = useState<Trader[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<"30m" | "1h" | "4h" | "8h" | "24h">("24h");

  const fetchTraders = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/traders?timeframe=${timeframe}&limit=10`);
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to fetch traders");
      }

      setTraders(data.data.traders);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTraders();
  }, [timeframe]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-green-500" />
          Top Traders
        </CardTitle>
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {(["30m", "1h", "4h", "8h", "24h"] as const).map((tf) => (
              <Button
                key={tf}
                variant={timeframe === tf ? "default" : "outline"}
                size="sm"
                onClick={() => setTimeframe(tf)}
              >
                {tf}
              </Button>
            ))}
          </div>
          <Button variant="outline" size="icon" onClick={fetchTraders}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="text-center text-red-400 py-4">
            Error: {error}
          </div>
        )}

        {!error && (
          <div className="space-y-2">
            {/* Header */}
            <div className="grid grid-cols-6 gap-4 px-3 py-2 text-xs text-muted-foreground font-medium">
              <div>#</div>
              <div>Wallet</div>
              <div className="text-right">Volume</div>
              <div className="text-right">Buy/Sell</div>
              <div className="text-right">Trades</div>
              <div className="text-right">Buy Vol</div>
            </div>

            {/* Traders */}
            {loading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <div
                    key={i}
                    className="h-12 bg-muted/50 rounded-lg animate-pulse"
                  />
                ))}
              </div>
            ) : (
              traders.map((trader, index) => {
                const buyRatio = trader.trade > 0 ? trader.tradeBuy / trader.trade : 0;
                return (
                  <div
                    key={trader.owner}
                    className="grid grid-cols-6 gap-4 px-3 py-3 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors items-center"
                    onClick={() => onSelectWallet?.(trader.owner)}
                  >
                    <div className="font-medium text-muted-foreground">
                      {index + 1}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm">
                        {formatAddress(trader.owner)}
                      </span>
                      <a
                        href={`https://solscan.io/account/${trader.owner}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ExternalLink className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                      </a>
                    </div>
                    <div className="text-right text-green-400">
                      {formatCurrency(trader.volume)}
                    </div>
                    <div className="text-right">
                      <Badge
                        variant={
                          buyRatio >= 0.6
                            ? "success"
                            : buyRatio >= 0.4
                            ? "warning"
                            : "danger"
                        }
                      >
                        {trader.tradeBuy}/{trader.tradeSell}
                      </Badge>
                    </div>
                    <div className="text-right text-muted-foreground">
                      {trader.trade.toLocaleString()}
                    </div>
                    <div className="text-right text-muted-foreground">
                      {formatCurrency(trader.volumeBuy)}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
