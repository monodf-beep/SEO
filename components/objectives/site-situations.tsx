import Link from "next/link";
import { cn } from "@/lib/utils";
import { SITE_ROLE_HINTS, SITE_ROLE_LABELS, type SiteSituation } from "@/lib/objective-sites";

const ROLE_CLASS: Record<SiteSituation["role"], string> = {
  pivot: "bg-primary/15 text-primary",
  secondaire: "bg-signal-muted text-signal",
  naissant: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  silencieux: "bg-muted text-muted-foreground",
};

const fmt = (n: number) => n.toLocaleString("fr-FR");

/** "Où en sont les sites": one line per site of the objective. */
export function SiteSituations({ rows, hasTerms }: { rows: SiteSituation[]; hasTerms: boolean }) {
  if (rows.length === 0) return null;
  return (
    <div className="panel mb-6 overflow-hidden">
      <div className="px-5 pt-5">
        <h3 className="font-heading text-lg font-semibold">Où en sont les sites</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {hasTerms
            ? "Sur les requêtes qui contiennent vos termes, 28 derniers jours. Le rôle se déduit des chiffres : il oriente les tâches de chaque site."
            : "Sur toutes les requêtes, 28 derniers jours. Le rôle se déduit des chiffres : il oriente les tâches de chaque site."}
        </p>
      </div>
      <div className="overflow-x-auto px-5 pb-4 pt-3">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
              <th className="py-2 text-left">Site</th>
              <th className="py-2 text-left">Rôle</th>
              <th className="py-2 pr-3 text-right">Requêtes</th>
              <th className="py-2 pr-3 text-right">Impr.</th>
              <th className="py-2 pr-3 text-right">Clics</th>
              <th className="py-2 pr-3 text-left">Meilleures positions</th>
              <th className="py-2 pr-3 text-left">Canaux (clics)</th>
              <th className="py-2 text-left">Crawl</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40 align-top">
            {rows.map((r) => (
              <tr key={r.site.id}>
                <td className="py-2.5 pr-3">
                  <Link href={`/sites/${r.site.id}`} className="font-medium text-foreground hover:underline">
                    {r.site.domain}
                  </Link>
                </td>
                <td className="py-2.5 pr-3">
                  <span
                    className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide", ROLE_CLASS[r.role])}
                    title={SITE_ROLE_HINTS[r.role]}
                  >
                    {SITE_ROLE_LABELS[r.role]}
                  </span>
                </td>
                <td className="py-2.5 pr-3 text-right font-data">{fmt(r.queries)}</td>
                <td className="py-2.5 pr-3 text-right font-data">{fmt(r.impressions)}</td>
                <td className="py-2.5 pr-3 text-right font-data">{fmt(r.clicks)}</td>
                <td className="py-2.5 pr-3 text-xs text-muted-foreground">
                  {r.bestQueries.length === 0
                    ? "—"
                    : r.bestQueries.map((q) => (
                        <span key={q.query} className="block truncate" title={q.page ?? undefined}>
                          « {q.query} » <span className="font-data text-foreground">pos. {q.position.toFixed(1)}</span> · {fmt(q.impressions)} impr.
                        </span>
                      ))}
                </td>
                <td className="py-2.5 pr-3 text-xs text-muted-foreground">
                  <SearchTypeCell totals={r.searchTypes} />
                </td>
                <td className="py-2.5 text-xs text-muted-foreground">
                  {!r.crawl.crawled ? (
                    <Link href={`/sites/${r.site.id}/crawl`} className="hover:underline">
                      Pas de crawl
                    </Link>
                  ) : (
                    <>
                      <span className="block">{fmt(r.crawl.pages)} pages</span>
                      <span className={cn("block", r.crawl.imagesMissingAlt > 0 && "text-amber-600 dark:text-amber-400")}>
                        {r.crawl.imagesMissingAlt > 0 ? `${fmt(r.crawl.imagesMissingAlt)} alt manquants` : "alt complets"}
                      </span>
                      <span className={cn("block", r.crawl.pagesMissingSocial > 0 && "text-amber-600 dark:text-amber-400")}>
                        {r.crawl.pagesMissingSocial > 0 ? `${fmt(r.crawl.pagesMissingSocial)} pages sans carte OG` : "cartes OG présentes"}
                      </span>
                      <span className="block">
                        {[
                          r.crawl.articlePages > 0 ? `${fmt(r.crawl.articlePages)} Article` : null,
                          r.crawl.eventPages > 0 ? `${fmt(r.crawl.eventPages)} Event` : null,
                          r.crawl.newsPages > 0 ? `${fmt(r.crawl.newsPages)} NewsArticle` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "pas de balisage de contenu"}
                      </span>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const TYPE_LABELS: Array<[keyof NonNullable<SiteSituation["searchTypes"]>, string]> = [
  ["web", "Web"],
  ["image", "Images"],
  ["video", "Vidéo"],
  ["news", "News"],
  ["discover", "Discover"],
  ["googleNews", "G. Actualités"],
];

/** Where the clicks come from. Zero on Discover or News is normal until
 *  Google serves the site there: that line is the one to watch. */
function SearchTypeCell({ totals }: { totals: SiteSituation["searchTypes"] }) {
  if (totals === undefined) return <span>—</span>;
  if (totals === null) return <span title="Propriété Search Console absente ou lecture impossible">non lu</span>;
  return (
    <>
      {TYPE_LABELS.map(([key, label]) => {
        const t = totals[key];
        if (!t) return null;
        const on = t.clicks > 0 || t.impressions > 0;
        return (
          <span key={key} className={cn("block", on && key !== "web" && "text-foreground")}>
            {label} <span className="font-data">{fmt(t.clicks)}</span>
            {t.impressions > 0 && <span className="text-muted-foreground"> · {fmt(t.impressions)} impr.</span>}
          </span>
        );
      })}
    </>
  );
}

