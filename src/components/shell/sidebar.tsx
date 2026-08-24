"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { PanelLeftClose, PanelLeft, Plus, Box } from "lucide-react";
import { cn } from "@/lib/utils";
import { navItems } from "./nav";
import { Button } from "@/components/ui/button";

export function Sidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "hidden lg:flex flex-col shrink-0 h-svh sticky top-0 z-30",
        "border-r border-border bg-surface/60 backdrop-blur-xl",
        "transition-[width] duration-300 ease-out",
        collapsed ? "w-[78px]" : "w-[256px]",
      )}
    >
      {/* Brand */}
      <div className="flex items-center gap-3 h-[68px] px-4 shrink-0">
        <div className="grid place-items-center h-10 w-10 rounded-2xl brand-gradient text-white shadow-[var(--shadow-glow)] shrink-0">
          <Box className="h-5 w-5" strokeWidth={2.2} />
        </div>
        <AnimatePresence>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              className="leading-tight"
            >
              <p className="font-semibold tracking-tight">Studio AI</p>
              <p className="text-xs text-subtle">Interior Design</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* New project CTA */}
      <div className="px-3 pb-2">
        <Link href="/new">
          <Button
            size={collapsed ? "icon" : "md"}
            className={cn("w-full", collapsed && "w-11 mx-auto")}
          >
            <Plus className="h-4 w-4 shrink-0" />
            {!collapsed && "New Project"}
          </Button>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
        {navItems.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={cn(
                "group relative flex items-center gap-3 rounded-xl px-3 h-11 text-[15px] font-medium",
                "transition-colors duration-200",
                active
                  ? "text-foreground"
                  : "text-muted hover:text-foreground hover:bg-surface-muted",
              )}
            >
              {active && (
                <motion.span
                  layoutId="nav-active"
                  className="absolute inset-0 rounded-xl bg-surface-muted border border-border"
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                />
              )}
              <Icon
                className={cn(
                  "h-5 w-5 shrink-0 relative z-10",
                  active && "text-primary",
                )}
                strokeWidth={active ? 2.3 : 2}
              />
              {!collapsed && (
                <span className="relative z-10 truncate">{item.label}</span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer / collapse */}
      <div className="p-3 border-t border-border">
        <button
          onClick={onToggle}
          className="flex items-center gap-3 w-full rounded-xl px-3 h-10 text-sm text-muted hover:text-foreground hover:bg-surface-muted transition-colors"
        >
          {collapsed ? (
            <PanelLeft className="h-5 w-5" />
          ) : (
            <>
              <PanelLeftClose className="h-5 w-5" />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
