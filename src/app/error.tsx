"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="grid place-items-center min-h-[70svh] text-center px-5">
      <div>
        <div className="grid place-items-center h-20 w-20 rounded-3xl bg-amber-500/10 text-amber-500 mx-auto mb-6">
          <AlertTriangle className="h-9 w-9" />
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">Something went wrong</h1>
        <p className="text-muted mt-2.5 max-w-sm mx-auto">
          An unexpected error occurred while rendering this view.
        </p>
        <Button className="mt-6" onClick={reset}>
          Try again
        </Button>
      </div>
    </div>
  );
}
