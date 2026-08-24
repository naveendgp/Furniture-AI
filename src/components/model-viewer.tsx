"use client";

import { createElement, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/* Wraps Google's <model-viewer> web component for interactive GLB preview.
   Loaded client-side only. Used by the manual upload tool now, and reusable for
   the marketplace / studio later. */
export function ModelViewer({
  src,
  className,
  poster,
}: {
  src: string;
  className?: string;
  poster?: string;
}) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    import("@google/model-viewer")
      .then(() => active && setReady(true))
      .catch(() => active && setReady(true));
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className={cn("relative overflow-hidden", className)}>
      {ready &&
        createElement("model-viewer", {
          src,
          poster,
          "camera-controls": "",
          "auto-rotate": "",
          "touch-action": "pan-y",
          "shadow-intensity": "1",
          exposure: "1",
          "environment-image": "neutral",
          style: { width: "100%", height: "100%", background: "transparent" },
        })}
      {!ready && (
        <div className="absolute inset-0 grid place-items-center text-sm text-subtle">
          Loading 3D preview…
        </div>
      )}
    </div>
  );
}
