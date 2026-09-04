import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DeleteSiteButton } from "@/components/sites/delete-site-button";
import { ApiKeysSection } from "@/components/settings/api-keys-section";
import { ApifySection } from "@/components/settings/apify-section";
import { SiteAccountSelect } from "@/components/sites/site-account-select";
import { listGoogleAccounts } from "@/lib/google/accounts";

interface Props {
  params: Promise<{ siteId: string }>;
}

export default async function SettingsPage({ params }: Props) {
  const session = await auth();
  const { siteId } = await params;

  const site = await db.site.findUnique({
    where: { id: siteId },
    select: {
      userId: true,
      domain: true,
      gscProperty: true,
      googleAccountId: true,
      createdAt: true,
      _count: {
        select: {
          keywords: true,
          pages: true,
          crawls: true,
          vitals: true,
          alerts: true,
          savedKeywords: true,
        },
      },
    },
  });
  if (!site || site.userId !== session?.user?.id) redirect("/sites");

  const googleAccounts = await listGoogleAccounts(session.user.id);

  // Check API key status
  const apiKeys = await db.apiKey.findMany({
    where: { userId: session.user.id },
    select: { provider: true, updatedAt: true },
  });
  const apiKeyStatus: Record<string, { connected: boolean; updatedAt?: string }> = {
    dataforseo: { connected: false },
    apify: { connected: false },
  };
  for (const key of apiKeys) {
    apiKeyStatus[key.provider] = {
      connected: true,
      updatedAt: key.updatedAt.toISOString(),
    };
  }

  return (
    <div>
      <PageHeader
        eyebrow={site.domain}
        title="Paramètres"
        description="Configuration du site et gestion des données"
      />

      <div className="space-y-6">
        {/* Site info */}
        <div className="panel p-5">
          <h3 className="font-heading text-lg font-semibold text-foreground">
            Détails du site
          </h3>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Domain</dt>
              <dd className="font-medium text-foreground">{site.domain}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Propriété GSC</dt>
              <dd className="font-medium text-foreground">
                {site.gscProperty || "Non connectée"}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">Compte Google (Search Console)</dt>
              <dd>
                <SiteAccountSelect
                  siteId={siteId}
                  accounts={googleAccounts.map((a) => ({ id: a.id, email: a.email, isPrimary: a.isPrimary }))}
                  current={site.googleAccountId}
                />
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Added</dt>
              <dd className="font-medium text-foreground">
                {new Date(site.createdAt).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </dd>
            </div>
          </dl>
        </div>

        {/* External API Keys */}
        <ApiKeysSection initialStatus={apiKeyStatus} />
        <ApifySection initialStatus={apiKeyStatus.apify} />

        {/* Data summary */}
        <div className="panel p-5">
          <h3 className="font-heading text-lg font-semibold text-foreground">
            Données stockées
          </h3>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <DataStat label="Lignes de mots-clés" value={site._count.keywords} />
            <DataStat label="Lignes de pages" value={site._count.pages} />
            <DataStat label="Crawls" value={site._count.crawls} />
            <DataStat label="Vitals reports" value={site._count.vitals} />
            <DataStat label="Alert rules" value={site._count.alerts} />
            <DataStat label="Mots-clés suivis" value={site._count.savedKeywords} />
          </div>
        </div>

        {/* Zone dangereuse */}
        <div className="panel border-danger/30 p-5">
          <h3 className="font-heading text-lg font-semibold text-danger">
            Zone dangereuse
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Supprime définitivement ce site et toutes ses données. Cette action
            est irréversible.
          </p>
          <div className="mt-4">
            <DeleteSiteButton siteId={siteId} domain={site.domain} />
          </div>
        </div>
      </div>
    </div>
  );
}

function DataStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border/50 bg-panel/80 px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-data text-lg font-semibold text-foreground">
        {value.toLocaleString()}
      </p>
    </div>
  );
}
