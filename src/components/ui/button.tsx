"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "outline";
type Size = "sm" | "md" | "lg" | "icon";

const variants: Record<Variant, string> = {
  primary:
    "brand-gradient text-white shadow-[var(--shadow-glow)] hover:brightness-110 hover:-translate-y-0.5",
  secondary:
    "bg-surface text-foreground border border-border shadow-[var(--shadow-sm)] hover:bg-surface-muted hover:-translate-y-0.5",
  ghost: "text-muted hover:text-foreground hover:bg-surface-muted",
  outline:
    "border border-border-strong text-foreground hover:bg-surface-muted hover:-translate-y-0.5",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3.5 text-sm gap-1.5 rounded-xl",
  md: "h-11 px-5 text-[15px] gap-2 rounded-xl",
  lg: "h-13 px-7 text-base gap-2.5 rounded-2xl",
  icon: "h-11 w-11 rounded-xl",
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center font-medium tracking-tight",
        "transition-all duration-200 ease-out active:scale-[0.98]",
        "disabled:opacity-50 disabled:pointer-events-none select-none",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = "Button";
