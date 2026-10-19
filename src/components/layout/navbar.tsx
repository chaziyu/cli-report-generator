"use client";

import Link from "next/link";
import { Plus } from "lucide-react";

export function Navbar() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800 bg-[#060b16] backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center">
          <Link href="/" className="flex items-center group">
            <span className="text-lg sm:text-xl font-bold tracking-tight text-white group-hover:text-blue-400 transition-colors">
              CTC PM Report Generator
            </span>
          </Link>
        </div>

        <div className="flex items-center gap-4">
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
