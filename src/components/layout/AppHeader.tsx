import { Activity, Compass, LayoutDashboard, LineChart, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const navItems = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "Wallets", icon: Wallet },
  { label: "Tasks", icon: Compass },
  { label: "Markets", icon: LineChart },
];

export function AppHeader() {
  return (
    <header className="border-b border-white/10 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-5 lg:px-6 xl:px-8">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
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
                A command deck for wallet authorization, trader intelligence, automated task control, and TimesNet-guided market decisions.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[420px]">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <div className="text-[0.7rem] uppercase tracking-[0.25em] text-muted-foreground">Monitoring</div>
              <div className="mt-2 flex items-center gap-2 text-sm font-medium">
                <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,0.8)]" />
                Live trader feed
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <div className="text-[0.7rem] uppercase tracking-[0.25em] text-muted-foreground">Coverage</div>
              <div className="mt-2 text-sm font-medium">Polygon + Solana wallet rails</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <div className="text-[0.7rem] uppercase tracking-[0.25em] text-muted-foreground">Filter</div>
              <div className="mt-2 text-sm font-medium">TimesNet execution gate</div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <nav className="flex flex-wrap items-center gap-2">
            {navItems.map(({ label, icon: Icon }, index) => (
              <Button
                key={label}
                variant={index === 0 ? "secondary" : "ghost"}
                className="h-10 rounded-full border border-white/10 px-4 text-sm"
              >
                <Icon className="mr-2 h-4 w-4" />
                {label}
              </Button>
            ))}
          </nav>

          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="secondary" className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5">
              Continuous monitoring
            </Badge>
            <Badge variant="outline" className="rounded-full border-white/10 px-3 py-1.5">
              Operator-first layout
            </Badge>
            <Badge variant="outline" className="rounded-full border-white/10 px-3 py-1.5">
              Natural language controls
            </Badge>
          </div>
        </div>
      </div>
    </header>
  );
}
