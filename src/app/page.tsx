import { prisma } from "@/lib/db/prisma";
import {
  ReportGeneratorWorkspace,
  RecentSessionItem,
} from "@/components/generator/report-generator-workspace";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const rawSessions = await prisma.pMSession.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
    include: {
      devices: {
        select: {
          id: true,
          hostname: true,
          model: true,
          role: true,
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

  const recentSessions: RecentSessionItem[] = rawSessions.map((s) => ({
    ...s,
    pmDate: s.pmDate.toISOString(),
    createdAt: s.createdAt.toISOString(),
  }));

  return <ReportGeneratorWorkspace initialSessions={recentSessions} />;
}
