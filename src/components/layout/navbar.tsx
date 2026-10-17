"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldCheck, Plus, ListFilter } from "lucide-react";

export function Navbar() {
  const pathname = usePathname();

  const navItems = [
    { href: "/", label: "Report Generator", icon: ShieldCheck },
  ];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800 bg-[#060b16] backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 shadow-md shadow-blue-500/20 group-hover:scale-105 transition-transform">
              <ShieldCheck className="h-6 w-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-white tracking-tight">CTC PM</span>
                <span className="rounded bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-blue-300 border border-blue-500/30">
                  Global
                </span>
              </div>
              <p className="text-xs text-slate-300 font-medium">Network Security PM Automation</p>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-1 pl-4 border-l border-slate-800">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                item.href === "/"
                  ? pathname === "/"
                  : pathname?.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-slate-800 text-blue-400 border border-slate-700 font-semibold"
                      : "text-slate-300 hover:text-white hover:bg-slate-850"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-2 rounded-full border border-slate-700 bg-[#0c1222] px-3.5 py-1 text-xs text-slate-300 font-medium shadow-sm">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <span>Local Engine · Node.js</span>
            <span className="text-slate-600">|</span>
            <span className="text-slate-200">SQLite + Prisma</span>
          </div>

          <Link
            href="/sessions/new"
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-blue-500 transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span>Start PM</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
