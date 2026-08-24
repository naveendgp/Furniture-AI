"use client";

import { useState } from "react";
import { User, Palette, Bell, CreditCard, Shield, Box, Video } from "lucide-react";
import { Page } from "@/components/ui/page";
import { Card } from "@/components/ui/primitives";
import { ModelUpload } from "@/components/settings/model-upload";
import { VideoExtractor } from "@/components/settings/video-extractor";
import { cn } from "@/lib/utils";

const sections = [
  { icon: Video, label: "360° Video → 3D" },
  { icon: Box, label: "Upload 3D Model" },
  { icon: User, label: "Profile" },
  { icon: Palette, label: "Appearance" },
  { icon: Bell, label: "Notifications" },
  { icon: CreditCard, label: "Billing" },
  { icon: Shield, label: "Privacy" },
];

function Toggle({ on: initial = false, label, hint }: { on?: boolean; label: string; hint: string }) {
  const [on, setOn] = useState(initial);
  return (
    <div className="flex items-center justify-between py-4">
      <div>
        <p className="font-medium">{label}</p>
        <p className="text-sm text-muted">{hint}</p>
      </div>
      <button
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={() => setOn((v) => !v)}
        className={cn(
          "relative h-7 w-12 rounded-full transition-colors shrink-0",
          on ? "brand-gradient" : "bg-surface-muted",
        )}
      >
        <span
          className={cn(
            "absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform",
            on ? "translate-x-6" : "translate-x-1",
          )}
        />
      </button>
    </div>
  );
}

export default function SettingsPage() {
  const [active, setActive] = useState("360° Video → 3D");
  return (
    <Page>
      <h1 className="text-3xl font-semibold tracking-tight mb-7">Settings</h1>
      <div className="grid lg:grid-cols-[220px_1fr] gap-6">
        <nav className="flex lg:flex-col gap-1 overflow-x-auto">
          {sections.map((s) => (
            <button
              key={s.label}
              onClick={() => setActive(s.label)}
              className={cn(
                "flex items-center gap-3 h-11 px-3.5 rounded-xl text-[15px] font-medium transition-colors whitespace-nowrap",
                active === s.label
                  ? "bg-surface-muted text-foreground"
                  : "text-muted hover:text-foreground hover:bg-surface-muted",
              )}
            >
              <s.icon className="h-[18px] w-[18px]" />
              {s.label}
            </button>
          ))}
        </nav>

        {active === "360° Video → 3D" ? (
          <div>
            <VideoExtractor />
          </div>
        ) : active === "Upload 3D Model" ? (
          <div>
            <ModelUpload />
          </div>
        ) : (
          <Card className="p-6 divide-y divide-border">
            <div className="flex items-center gap-4 pb-5">
              <span className="grid place-items-center h-16 w-16 rounded-2xl bg-gradient-to-br from-accent-purple to-primary text-white text-xl font-semibold">
                NA
              </span>
              <div>
                <p className="text-lg font-semibold">Naveen</p>
                <p className="text-muted text-sm">naveendgp@gmail.com</p>
              </div>
            </div>
            <Toggle on label="Dark-aware renders" hint="Match render lighting to your theme" />
            <Toggle on label="AI suggestions" hint="Show proactive design tips in the studio" />
            <Toggle label="Email digests" hint="Weekly summary of your projects" />
            <Toggle on label="Auto-save drafts" hint="Never lose your work in progress" />
          </Card>
        )}
      </div>
    </Page>
  );
}
