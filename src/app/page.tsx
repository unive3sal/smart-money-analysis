"use client";

import { useState } from "react";
import { TraderLeaderboard } from "@/components/TraderLeaderboard";
import { ChatInterface } from "@/components/ChatInterface";
import { Activity, MessageSquare, TrendingUp } from "lucide-react";

export default function Home() {
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null);

  const handleSelectWallet = (address: string) => {
    setSelectedWallet(address);
    // Scroll to chat or open wallet analysis
  };

  return (
    <main className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Activity className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-bold">Smart Money Analysis</h1>
                <p className="text-sm text-muted-foreground">
                  Solana Alpha Hunter
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                Live
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column - Leaderboard */}
          <div className="space-y-6">
            <TraderLeaderboard onSelectWallet={handleSelectWallet} />

            {/* Quick Stats */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-card rounded-xl border p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <TrendingUp className="h-4 w-4" />
                  <span className="text-xs">Top PnL (24h)</span>
                </div>
                <div className="text-2xl font-bold text-green-400">+$847K</div>
              </div>
              <div className="bg-card rounded-xl border p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Activity className="h-4 w-4" />
                  <span className="text-xs">Active Traders</span>
                </div>
                <div className="text-2xl font-bold">1,234</div>
              </div>
              <div className="bg-card rounded-xl border p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <MessageSquare className="h-4 w-4" />
                  <span className="text-xs">Avg Win Rate</span>
                </div>
                <div className="text-2xl font-bold">58%</div>
              </div>
            </div>
          </div>

          {/* Right Column - Chat */}
          <div>
            <ChatInterface
              initialPrompt={
                selectedWallet
                  ? `Analyze wallet ${selectedWallet}`
                  : undefined
              }
            />
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t mt-auto">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <div>Smart Money Analysis - Solana Hackathon 2026</div>
            <div className="flex items-center gap-4">
              <span>Powered by Birdeye API</span>
              <span>|</span>
              <span>Google ADK</span>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
