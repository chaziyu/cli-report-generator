import React from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "danger" | "ghost";
  size?: "sm" | "md" | "lg" | "icon";
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant = "primary", size = "md", disabled, ...props },
    ref
  ) => {
    const base =
      "inline-flex items-center justify-center font-medium rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 disabled:pointer-events-none";

    const variantStyles = {
      primary:
        "bg-blue-600 text-white hover:bg-blue-500 shadow-sm active:bg-blue-700",
      secondary:
        "bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700",
      outline:
        "border border-slate-700 bg-transparent text-slate-300 hover:bg-slate-800/80 hover:text-white",
      danger:
        "bg-rose-600 text-white hover:bg-rose-500 active:bg-rose-700",
      ghost:
        "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50",
    };

    const sizeStyles = {
      sm: "h-8 px-3 text-xs gap-1.5",
      md: "h-9 px-4 text-sm gap-2",
      lg: "h-11 px-6 text-base gap-2.5",
      icon: "h-9 w-9 p-0",
    };

    return (
      <button
        ref={ref}
        disabled={disabled}
        className={cn(base, variantStyles[variant], sizeStyles[size], className)}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";
