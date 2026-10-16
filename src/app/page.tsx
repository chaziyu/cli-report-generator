import Link from "next/link";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/db/prisma";
import { Button } from "@/components/ui/button";
import { SessionListClient, SessionItem } from "@/components/session/session-list-client";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const rawSessions = await prisma.pMSession.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      devices: {
        select: {
          id: true,
          hostname: true,
          model: true,
          serialNumber: true,
          role: true,
        },
      },
      uploadedFiles: {
        select: {
          id: true,
          type: true,
          originalFilename: true,
          sizeBytes: true,
        },
      },
      _count: {
        select: {
          devices: true,
          uploadedFiles: true,
          generatedReports: true,
        },
      },
    },
  });

  const sessions: SessionItem[] = rawSessions.map((s) => ({
    ...s,
    pmDate: s.pmDate.toISOString(),
    createdAt: s.createdAt.toISOString(),
  }));

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-8 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Preventive Maintenance Sessions
            </h1>
            <span className="rounded-md bg-blue-500/15 px-2.5 py-0.5 text-xs font-semibold text-blue-300 border border-blue-500/30">
              FortiGate-Ready
            </span>
          </div>
          <p className="mt-1.5 text-sm text-slate-300 font-normal leading-relaxed">
            Local-first automation: parse PuTTY session logs, deterministic checklist validation, CLI evidence generation, and Word report updating.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link href="/sessions/new">
            <Button className="gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold shadow-md shadow-blue-900/40">
              <Plus className="h-4 w-4" />
              <span>Create PM Session</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="mt-8">
        <SessionListClient initialSessions={sessions} />
      </div>
    </div>
  );
}
