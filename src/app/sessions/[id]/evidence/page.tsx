import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, FileImage } from "lucide-react";
import { prisma } from "@/lib/db/prisma";
import { EvidenceWorkspace } from "@/components/evidence";

export const dynamic = "force-dynamic";

interface EvidencePageProps {
  params: Promise<{ id: string }>;
}

export default async function SessionEvidencePage({ params }: EvidencePageProps) {
  const { id } = await params;

  const session = await prisma.pMSession.findUnique({
    where: { id },
    include: {
      devices: true,
    },
  });

  if (!session) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Navigation Breadcrumb */}
      <div>
        <Link
          href={`/sessions/${id}`}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors mb-3"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Session Overview</span>
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl flex items-center gap-2.5">
                <FileImage className="h-7 w-7 text-emerald-400" />
                Appendix Evidence Generator
              </h1>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Terminal-style PNG evidence renderer with PuTTY session log traceability for {session.customer} ({session.vendor}).
            </p>
          </div>
        </div>
      </div>

      {/* Main Evidence Workspace */}
      <EvidenceWorkspace
        sessionId={session.id}
        devices={session.devices}
        customerName={session.customer}
        vendorName={session.vendor}
      />
    </div>
  );
}
