"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Wand2, Plus, Sofa, FolderKanban } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { label: "Home", href: "/", icon: LayoutDashboard },
  { label: "Studio", href: "/studio", icon: Wand2 },
  { label: "New", href: "/new", icon: Plus, primary: true },
  { label: "Library", href: "/library", icon: Sofa },
  { label: "Projects", href: "/projects", icon: FolderKanban },
];

export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 glass border-t border-border pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center justify-around h-16 px-2">
        {items.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;
          if (item.primary) {
            return (
              <Link key={item.href} href={item.href} aria-label="New project"
                className="grid place-items-center h-12 w-12 -mt-6 rounded-2xl brand-gradient text-white shadow-[var(--shadow-glow)]">
                <Icon className="h-6 w-6" />
              </Link>
            );
          }
          return (
            <Link key={item.href} href={item.href}
              className={cn(
                "flex flex-col items-center gap-1 px-3 py-1 text-[11px] font-medium transition-colors",
                active ? "text-primary" : "text-subtle",
              )}>
              <Icon className="h-5 w-5" strokeWidth={active ? 2.4 : 2} />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
