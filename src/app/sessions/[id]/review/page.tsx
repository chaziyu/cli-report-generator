import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/db/prisma";
import { ReviewWorkspace } from "@/components/report";

export const dynamic = "force-dynamic";

interface ReviewPageProps {
  params: Promise<{ id: string }>;
}

export default async function SessionReviewPage({ params }: ReviewPageProps) {
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
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-8 pb-16">
      <div className="mb-6">
        <Link
          href={`/sessions/${id}`}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors mb-3"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Session Overview</span>
        </Link>
      </div>

      <ReviewWorkspace sessionId={id} />
    </div>
  );
}
