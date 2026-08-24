"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { MobileNav } from "./mobile-nav";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  // The Design Studio is an immersive full-bleed canvas — no topbar chrome.
  const immersive = pathname.startsWith("/studio");

  return (
    <div className="flex min-h-svh">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      <div className="flex flex-col flex-1 min-w-0">
        {!immersive && <Topbar />}
        <main className="flex-1 min-w-0 pb-20 lg:pb-0">{children}</main>
      </div>
      <MobileNav />
    </div>
  );
}
