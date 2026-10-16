import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/layout/navbar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CTC PM Automation Tool | CTC Global Network Security",
  description:
    "Local-first Preventive Maintenance reporting automation for FortiGate and multi-vendor firewalls",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full dark`}
    >
      <body className="min-h-full flex flex-col bg-[#030712] text-slate-100 font-sans antialiased selection:bg-blue-600/30 selection:text-blue-200">
        <Navbar />
        <main className="flex-1 pb-16">{children}</main>
        <footer className="border-t border-slate-800 bg-[#060b16] py-6 text-center text-xs text-slate-400">
          <div className="mx-auto max-w-7xl px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
            <div>
              CTC Global Malaysia · Network Security Practice · QMS-P09-F01 Engine
            </div>
            <div className="flex items-center gap-3">
              <span>Local-first · Offline Capable</span>
              <span>•</span>
              <span>Confidential Log Retention</span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
