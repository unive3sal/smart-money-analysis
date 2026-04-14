"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle, XCircle, MinusCircle } from "lucide-react";

interface ConfidenceData {
  score: number;
  signal: "strong_buy" | "buy" | "hold" | "sell" | "strong_sell" | "avoid";
  reliability: "low" | "medium" | "high";
  components: {
    marketActivityScore: number;
    mediaScore: number;
    technicalScore: number;
    riskScore: number;
  };
  reasoning: string[];
  warnings: string[];
}

interface ConfidenceIndicatorProps {
  data: ConfidenceData;
  tokenSymbol?: string;
}

export function ConfidenceIndicator({
  data,
  tokenSymbol,
}: ConfidenceIndicatorProps) {
  const getSignalColor = (signal: ConfidenceData["signal"]) => {
    switch (signal) {
      case "strong_buy":
        return "text-green-400 bg-green-400/10";
      case "buy":
        return "text-green-300 bg-green-300/10";
      case "hold":
        return "text-yellow-400 bg-yellow-400/10";
      case "sell":
        return "text-red-300 bg-red-300/10";
      case "strong_sell":
        return "text-red-400 bg-red-400/10";
      case "avoid":
        return "text-red-500 bg-red-500/10";
    }
  };

  const getSignalIcon = (signal: ConfidenceData["signal"]) => {
    switch (signal) {
      case "strong_buy":
      case "buy":
        return <CheckCircle className="h-5 w-5" />;
      case "hold":
        return <MinusCircle className="h-5 w-5" />;
      case "sell":
      case "strong_sell":
      case "avoid":
        return <XCircle className="h-5 w-5" />;
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 70) return "bg-green-500";
    if (score >= 50) return "bg-yellow-500";
    if (score >= 30) return "bg-orange-500";
    return "bg-red-500";
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center justify-between">
          <span>Confidence Score {tokenSymbol && `- ${tokenSymbol}`}</span>
          <Badge
            variant={
              data.reliability === "high"
                ? "success"
                : data.reliability === "medium"
                ? "warning"
                : "danger"
            }
          >
            {data.reliability} reliability
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Main Score & Signal */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="text-4xl font-bold">{data.score}</div>
            <div className="text-sm text-muted-foreground">/ 100</div>
          </div>
          <div
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg font-semibold",
              getSignalColor(data.signal)
            )}
          >
            {getSignalIcon(data.signal)}
            <span className="uppercase">{data.signal.replace("_", " ")}</span>
          </div>
        </div>

        {/* Score Bar */}
        <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
          <div
            className={cn("h-full transition-all", getScoreColor(data.score))}
            style={{ width: `${data.score}%` }}
          />
        </div>

        {/* Component Scores */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Market Activity", value: data.components.marketActivityScore },
            { label: "Media", value: data.components.mediaScore },
            { label: "Technical", value: data.components.technicalScore },
            { label: "Risk", value: data.components.riskScore },
          ].map((component) => (
            <div
              key={component.label}
              className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-2"
            >
              <span className="text-sm text-muted-foreground">
                {component.label}
              </span>
              <span className="font-medium">{component.value}</span>
            </div>
          ))}
        </div>

        {/* Reasoning */}
        {data.reasoning.length > 0 && (
          <div className="space-y-1">
            <h4 className="text-sm font-medium">Analysis</h4>
            <ul className="text-sm text-muted-foreground space-y-1">
              {data.reasoning.map((reason, i) => (
                <li key={i} className="flex items-start gap-2">
                  <CheckCircle className="h-3 w-3 mt-1 text-green-400 flex-shrink-0" />
                  {reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Warnings */}
        {data.warnings.length > 0 && (
          <div className="space-y-1">
            <h4 className="text-sm font-medium text-yellow-400">Warnings</h4>
            <ul className="text-sm space-y-1">
              {data.warnings.map((warning, i) => (
                <li key={i} className="flex items-start gap-2 text-yellow-400/80">
                  <AlertTriangle className="h-3 w-3 mt-1 flex-shrink-0" />
                  {warning}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
