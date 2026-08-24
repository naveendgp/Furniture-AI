import Link from "next/link";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="grid place-items-center min-h-[70svh] text-center px-5">
      <div>
        <div className="grid place-items-center h-20 w-20 rounded-3xl bg-surface-muted mx-auto mb-6">
          <Compass className="h-9 w-9 text-subtle" />
        </div>
        <h1 className="text-4xl font-semibold tracking-tight">Page not found</h1>
        <p className="text-muted mt-2.5 max-w-sm mx-auto">
          We couldn&apos;t find that room. Let&apos;s get you back to your studio.
        </p>
        <Link href="/" className="inline-block mt-6">
          <Button>Back to Dashboard</Button>
        </Link>
      </div>
    </div>
  );
}
