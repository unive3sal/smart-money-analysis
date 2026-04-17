import { ReactNode } from "react";
import { AppFooter } from "@/frontend/components/layout/AppFooter";
import { AppHeader } from "@/frontend/components/layout/AppHeader";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <a
        href="#main-content"
        className="sr-only absolute left-4 top-4 z-50 rounded-md bg-background px-3 py-2 text-sm text-foreground shadow focus:not-sr-only"
      >
        Skip to main content
      </a>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.18),transparent_28%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.12),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.035),transparent_28%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:72px_72px]" />
      <div className="relative flex min-h-screen flex-col">
        <AppHeader />
        <main id="main-content" className="flex-1">
          {children}
        </main>
        <AppFooter />
      </div>
    </div>
  );
}
