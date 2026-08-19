import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { getTopKeywords } from "@/lib/seo-metrics";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { SyncButton } from "@/components/sites/sync-button";
import { CsvExportButton } from "@/components/ui/csv-export-button";
import { DataLagBadge } from "@/components/ui/data-lag-badge";
import { KeywordsTable } from "@/components/sites/keywords-table";

interface KeywordsPageProps {
  params: Promise<{ siteId: string }>;
}

export default async function KeywordsPage({ params }: KeywordsPageProps) {
  const session = await auth();
  const { siteId } = await params;

  const site = await db.site.findUnique({
    where: { id: siteId },
    select: { userId: true, domain: true },
  });

  if (!site || site.userId !== session?.user?.id) {
    redirect("/sites");
  }

  // Load a wide set so position/impression filters aren't capped to top-by-clicks.
  const keywords = await getTopKeywords(siteId, 28, 1000);

  return (
    <div>
      <PageHeader
        eyebrow={site.domain}
        title="Mots-clés"
        description="Requêtes avec impressions sur les 28 derniers jours, agrégées par jour."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <DataLagBadge />
            <CsvExportButton siteId={siteId} type="keywords" />
            <SyncButton siteId={siteId} />
          </div>
        }
      />

      {keywords.length === 0 ? (
        <EmptyState
          icon="⌘"
          title="Aucun mot-clé pour l'instant"
          description="Synchronisez la Search Console pour alimenter les performances par requête."
        />
      ) : (
        <KeywordsTable keywords={keywords} />
      )}
    </div>
  );
}
