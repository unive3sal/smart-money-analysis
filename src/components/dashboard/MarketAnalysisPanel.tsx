"use client";

import { useCallback, useEffect, useState } from "react";
import { BrainCircuit, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency, formatPercent } from "@/lib/utils";

interface Market {
  marketId: string;
  tokenId: string;
  slug: string;
  question: string;
  volume24h: number;
  liquidity: number;
  lastPrice: number;
  bestBid: number;
  bestAsk: number;
  priceChange24h: number;
  tags: string[];
}

interface Analysis {
  marketId: string;
  tokenId: string;
  question: string;
  currentPrice: number;
  summary: string;
  signal: string;
  confidence: number;
  recommendedAction: string;
  priceHistory: number[];
}

export function MarketAnalysisPanel() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [selectedMarketId, setSelectedMarketId] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loadingMarkets, setLoadingMarkets] = useState(true);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);

  const loadAnalysis = useCallback(async (marketId: string) => {
    try {
      setLoadingAnalysis(true);
      const response = await fetch(`/api/markets/${marketId}/analysis`, { cache: "no-store" });
      const payload = await response.json();
      setAnalysis(payload.data || null);
    } finally {
      setLoadingAnalysis(false);
    }
  }, []);

  const loadMarkets = useCallback(async () => {
    const response = await fetch("/api/markets", { cache: "no-store" });
    const payload = await response.json();
    const data = payload.data as Market[];
    setMarkets(data);
    if (data[0] && !selectedMarketId) {
      setSelectedMarketId(data[0].marketId);
      await loadAnalysis(data[0].marketId);
    }
  }, [loadAnalysis, selectedMarketId]);

  useEffect(() => {
    loadMarkets().finally(() => setLoadingMarkets(false));
  }, [loadMarkets]);

  const selectedMarket = markets.find((market) => market.marketId === selectedMarketId) || markets[0];

  return (
    <Card className="rounded-[28px] border-white/10 bg-white/[0.035] shadow-[0_20px_60px_rgba(0,0,0,0.2)]">
      <CardHeader className="border-b border-white/10 pb-5">
        <CardTitle className="flex items-center gap-2">
          <BrainCircuit className="h-5 w-5 text-primary" />
          Market intelligence & AI analysis
        </CardTitle>
        <CardDescription>
          Inspect Polymarket market stats and the latest TimesNet guidance used to filter copytrade executions.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
          <div className="flex-1 space-y-2">
            <div className="text-sm font-medium">Market</div>
            <Select
              value={selectedMarketId}
              onValueChange={(value) => {
                setSelectedMarketId(value);
                void loadAnalysis(value);
              }}
            >
              <SelectTrigger className="border-white/10 bg-background/70">
                <SelectValue placeholder="Select market" />
              </SelectTrigger>
              <SelectContent>
                {markets.map((market) => (
                  <SelectItem key={market.marketId} value={market.marketId}>
                    {market.question}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
              <Button variant="outline" className="border-white/10" onClick={() => selectedMarketId && loadAnalysis(selectedMarketId)} disabled={loadingAnalysis || !selectedMarketId}>
            {loadingAnalysis ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Refresh analysis
          </Button>
        </div>

        {loadingMarkets ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading markets...
          </div>
        ) : selectedMarket ? (
          <>
            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-2xl border border-white/10 bg-background/80 p-4">
                <div className="text-xs text-muted-foreground">Last price</div>
                <div className="mt-1 text-xl font-semibold">{(selectedMarket.lastPrice * 100).toFixed(1)}¢</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-background/80 p-4">
                <div className="text-xs text-muted-foreground">24h change</div>
                <div className="mt-1 text-xl font-semibold">{formatPercent(selectedMarket.priceChange24h * 100)}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-background/80 p-4">
                <div className="text-xs text-muted-foreground">Volume</div>
                <div className="mt-1 text-xl font-semibold">{formatCurrency(selectedMarket.volume24h)}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-background/80 p-4">
                <div className="text-xs text-muted-foreground">Liquidity</div>
                <div className="mt-1 text-xl font-semibold">{formatCurrency(selectedMarket.liquidity)}</div>
              </div>
            </div>

            <div className="space-y-4 rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
              <div className="flex flex-wrap items-center gap-2">
                {(selectedMarket.tags || []).map((tag) => (
                  <Badge key={tag} variant="secondary">{tag}</Badge>
                ))}
                <Badge variant="outline">Bid {(selectedMarket.bestBid * 100).toFixed(1)}¢</Badge>
                <Badge variant="outline">Ask {(selectedMarket.bestAsk * 100).toFixed(1)}¢</Badge>
              </div>
              {analysis ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Badge>{analysis.signal}</Badge>
                    <Badge variant="secondary">Confidence {(analysis.confidence * 100).toFixed(0)}%</Badge>
                  </div>
                  <div className="font-medium">{analysis.summary}</div>
                  <div className="text-sm text-muted-foreground">{analysis.recommendedAction}</div>
                  <div className="rounded-2xl border border-white/10 bg-background/80 p-3">
                    <div className="text-xs text-muted-foreground mb-2">Synthetic market history used for TimesNet</div>
                    <div className="grid grid-cols-12 gap-1">
                      {analysis.priceHistory.slice(-24).map((point, index) => (
                        <div
                          key={`${point}-${index}`}
                          className="rounded bg-primary/70"
                          style={{ height: `${Math.max(8, point * 80)}px` }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">No AI analysis loaded yet.</div>
              )}
            </div>
          </>
        ) : (
          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            No markets available.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
