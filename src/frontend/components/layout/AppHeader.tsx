"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import {
  Activity,
  Bot,
  LayoutDashboard,
  LineChart,
  Wallet,
  Workflow,
} from "lucide-react";
import { Badge } from "@/frontend/components/ui/badge";
import { buttonVariants } from "@/frontend/components/ui/button";

type DashboardView = "overview" | "automation" | "traders" | "markets" | "wallets" | "assistant";

const navItems: Array<{ label: string; icon: typeof LayoutDashboard; view: DashboardView }> = [
  { label: "Overview", icon: LayoutDashboard, view: "overview" },
  { label: "Automation", icon: Workflow, view: "automation" },
  { label: "Traders", icon: Activity, view: "traders" },
  { label: "Markets", icon: LineChart, view: "markets" },
  { label: "Wallets", icon: Wallet, view: "wallets" },
  { label: "Assistant", icon: Bot, view: "assistant" },
];

const summaryItems = [
  {
    label: "Wallet rails",
    value: "Browser-signed sessions",
  },
  {
    label: "Automation",
    value: "Task-first operations",
  },
  {
    label: "AI gate",
    value: "TimesNet advisory filter",
  },
];

function isDashboardView(value: string | null): value is DashboardView {
  return value === "overview"
    || value === "automation"
    || value === "traders"
    || value === "markets"
    || value === "wallets"
    || value === "assistant";
}

function AppHeaderContent() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedView = searchParams.get("view");
  const activeView: DashboardView = pathname === "/" && isDashboardView(requestedView)
    ? requestedView
    : "overview";

  return (
    <header className="border-b border-white/10 bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5 px-4 py-5 lg:px-6 xl:px-8">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 shadow-[0_0_40px_rgba(59,130,246,0.15)]">
              <Activity className="h-5 w-5 text-primary" />
            </div>
            <div className="space-y-1">
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.35em] text-primary/80">
                Smart money operating system
              </p>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                Polymarket Copytrade Control Center
              </h1>
              <p className="max-w-3xl text-sm leading-6 text-muted-foreground sm:text-[0.95rem]">
                Navigate between overview, automation, traders, markets, wallets, and assistant workflows without crowding the operator view.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[420px]">
            {summaryItems.map((item) => (
              <div key={item.label} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                <div className="text-[0.7rem] uppercase tracking-[0.25em] text-muted-foreground">{item.label}</div>
                <div className="mt-2 text-sm font-medium">{item.value}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <nav aria-label="Dashboard sections" className="flex flex-wrap items-center gap-2">
            {navItems.map(({ label, icon: Icon, view }) => {
              const href = view === "overview" ? "/" : `/?view=${view}`;
              const isActive = activeView === view;

              return (
                <Link
                  key={label}
                  href={href}
                  className={`${buttonVariants({ variant: isActive ? "secondary" : "ghost" })} h-10 rounded-full border border-white/10 px-4 text-sm`}
                >
                  <Icon className="mr-2 h-4 w-4" />
                  {label}
                </Link>
              );
            })}
          </nav>

          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="secondary" className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5">
              Session-aware control deck
            </Badge>
            <Badge variant="outline" className="rounded-full border-white/10 px-3 py-1.5">
              Safer task operations
            </Badge>
            <Badge variant="outline" className="rounded-full border-white/10 px-3 py-1.5">
              Trading bot workflow layout
            </Badge>
          </div>
        </div>
      </div>
    </header>
  );
}

export function AppHeader() {
  return (
    <Suspense fallback={<header className="border-b border-white/10 bg-background/90 px-4 py-5 lg:px-6 xl:px-8" />}>
      <AppHeaderContent />
    </Suspense>
  );
}
