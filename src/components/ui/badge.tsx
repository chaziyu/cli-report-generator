import React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "success" | "warning" | "destructive" | "outline";
}

export function Badge({
  className,
  variant = "default",
  ...props
}: BadgeProps) {
  const variantStyles = {
    default: "bg-blue-950/80 text-blue-300 border-blue-500/40",
    secondary: "bg-slate-800/90 text-slate-200 border-slate-700",
    success: "bg-emerald-950/80 text-emerald-300 border-emerald-500/40",
    warning: "bg-amber-950/80 text-amber-300 border-amber-500/40",
    destructive: "bg-rose-950/80 text-rose-300 border-rose-500/40",
    outline: "border-slate-700 bg-slate-900/80 text-slate-200",
  };

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        variantStyles[variant],
        className
      )}
      {...props}
    />
  );
}
