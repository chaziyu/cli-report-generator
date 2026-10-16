import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/db/prisma";
import { SessionWorkspace, SessionDetail } from "@/components/session/session-workspace";

export const dynamic = "force-dynamic";

interface SessionPageProps {
  params: Promise<{ id: string }>;
}

export default async function SessionDetailPage({ params }: SessionPageProps) {
  const { id } = await params;

  const rawSession = await prisma.pMSession.findUnique({
    where: { id },
    include: {
      devices: {
        orderBy: { createdAt: "asc" },
      },
      uploadedFiles: {
        orderBy: { createdAt: "desc" },
      },
      generatedReports: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!rawSession) {
    notFound();
  }

  const session: SessionDetail = {
    ...rawSession,
    pmDate: rawSession.pmDate.toISOString(),
    createdAt: rawSession.createdAt.toISOString(),
    devices: rawSession.devices.map((d) => ({
      ...d,
      createdAt: d.createdAt.toISOString(),
    })),
    uploadedFiles: rawSession.uploadedFiles.map((f) => ({
      ...f,
      createdAt: f.createdAt.toISOString(),
    })),
    generatedReports: rawSession.generatedReports.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
    })),
  };

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-8">
      <div className="mb-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors mb-3"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to All Sessions</span>
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              {session.customer}
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Preventive Maintenance Workspace · Session ID:{" "}
              <span className="font-mono text-xs text-slate-300">{session.id}</span>
            </p>
          </div>
        </div>
      </div>

      <SessionWorkspace session={session} />
    </div>
  );
}
