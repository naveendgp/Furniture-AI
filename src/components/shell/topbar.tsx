"use client";

import { Search, Bell } from "lucide-react";
import { ThemeToggle } from "./theme-toggle";

export function Topbar() {
  return (
    <header className="sticky top-0 z-20 h-[68px] shrink-0 glass border-b border-border">
      <div className="flex items-center gap-3 h-full px-5 lg:px-8">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-subtle" />
          <input
            type="search"
            placeholder="Search projects, furniture, styles…"
            aria-label="Search"
            className="w-full h-11 pl-11 pr-4 rounded-xl bg-surface-muted/70 border border-transparent focus:border-border focus:bg-surface text-[15px] placeholder:text-subtle outline-none transition-colors"
          />
        </div>

        <div className="flex-1" />

        <button
          aria-label="Notifications"
          className="relative grid place-items-center h-10 w-10 rounded-xl border border-border bg-surface text-muted hover:text-foreground hover:bg-surface-muted transition-colors"
        >
          <Bell className="h-[18px] w-[18px]" />
          <span className="absolute top-2 right-2.5 h-2 w-2 rounded-full bg-primary ring-2 ring-surface" />
        </button>

        <ThemeToggle />

        <button className="flex items-center gap-2.5 pl-1 pr-1 group">
          <span className="grid place-items-center h-10 w-10 rounded-xl bg-gradient-to-br from-accent-purple to-primary text-white font-semibold text-sm shadow-[var(--shadow-sm)]">
            NA
          </span>
        </button>
      </div>
    </header>
  );
}
