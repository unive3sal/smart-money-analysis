import { Activity, Bot, BrainCircuit, ShieldCheck } from "lucide-react";

const footerItems = [
  {
    title: "Wallet authority",
    value: "Browser-signed sessions",
    icon: ShieldCheck,
  },
  {
    title: "Market intelligence",
    value: "TimesNet advisory layer",
    icon: BrainCircuit,
  },
  {
    title: "Automation loop",
    value: "Trader activity to task execution",
    icon: Activity,
  },
  {
    title: "Assistant surface",
    value: "Chat-driven inspection and control",
    icon: Bot,
  },
];

export function AppFooter() {
  return (
    <footer className="border-t border-white/10 bg-background/80">
      <div className="mx-auto grid w-full max-w-[1600px] gap-3 px-4 py-6 sm:grid-cols-2 lg:px-6 xl:grid-cols-4 xl:px-8">
        {footerItems.map(({ title, value, icon: Icon }) => (
          <div key={title} className="rounded-2xl border border-white/10 bg-white/[0.025] px-4 py-4">
            <div className="flex items-center gap-2 text-[0.7rem] uppercase tracking-[0.24em] text-muted-foreground">
              <Icon className="h-3.5 w-3.5 text-primary" />
              {title}
            </div>
            <div className="mt-3 text-sm font-medium leading-6 text-foreground">{value}</div>
          </div>
        ))}
      </div>
    </footer>
  );
}
