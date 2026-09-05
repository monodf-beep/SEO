import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  effectiveObjective,
  formatShare,
  getObjectiveKpi,
  loadInScope,
  resolveScope,
  type Bucket,
  type QueryRow,
} from "@/lib/objectives";
import { pickHub } from "@/lib/objective-notoriety";
import { loadCrawlHealth, siteSituations } from "@/lib/objective-sites";
import { searchTypesForSites } from "@/lib/objective-search-types";
import { SiteSituations } from "@/components/objectives/site-situations";
import { AiCitationsPanel } from "@/components/objectives/ai-citations-panel";
import { latestAiCitations } from "@/lib/ai-citations";
import { PageHeader } from "@/components/ui/page-header";
import { DataLagBadge } from "@/components/ui/data-lag-badge";
import { PositionBadge, NumCell } from "@/components/ui/data-table";
import { ObjectiveFormDialog } from "@/components/objectives/objective-form-dialog";
import { AddChannelsButton, DeleteObjectiveButton } from "@/components/objectives/objective-buttons";
import { CoordinatedPlan, coordinatedTopics } from "@/components/objectives/coordinated-plan";
import { SURFACE_LABELS, type Surface } from "@/lib/objective-surfaces";
import { ObjectiveTasks } from "@/components/objectives/objective-tasks";
import { ShareSparkline } from "@/components/objectives/share-sparkline";
import { formatDeltaPercent } from "@/lib/format";
import { calculatePercentChange } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";

interface Props {
  params: Promise<{ objectiveId: string }>;
}

export default async function ObjectivePage({ params }: Props) {
  const session = await auth();
  const userId = session?.user?.id;
  const { objectiveId } = await params;

  const stored = await db.objective.findUnique({
    where: { id: objectiveId },
    include: {
      parent: { select: { id: true, title: true } },
      children: { where: { status: { not: "ARCHIVED" } }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!stored || stored.userId !== userId) redirect("/objectives");
  // A channel child reads its parent's sites and vocabulary.
  const objective = await effectiveObjective(stored);
  const inherits = objective.surfaces.length > 0 && stored.focusTerms.length === 0 && stored.rivalTerms.length === 0 && Boolean(stored.parentId);

  const [sites, allObjectives, actions, scope] = await Promise.all([
    db.site.findMany({
      where: { userId },
      select: { id: true, domain: true },
      orderBy: { domain: "asc" },
    }),
    db.objective.findMany({
      where: { userId, status: { not: "ARCHIVED" } },
      select: { id: true, title: true, parentId: true },
    }),
    db.objectiveAction.findMany({
      where: { objectiveId },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    }),
    resolveScope(objective),
  ]);
  // The coordinated plan reads this objective's tasks and its children's.
  const childIds = objective.children.map((c) => c.id);
  const familyActions = childIds.length
    ? await db.objectiveAction.findMany({ where: { objectiveId: { in: [objectiveId, ...childIds] } } })
    : actions;
  const topics = coordinatedTopics(familyActions);
  const objectiveTitles = new Map<string, string>([[objective.id, objective.title], ...objective.children.map((c) => [c.id, c.title] as [string, string])]);
  const hasChannelChildren = objective.children.some((c) => c.surfaces.length > 0);

  const [kpi, childrenKpi, scoped, health, searchTypes, aiCitations] = await Promise.all([
    getObjectiveKpi(objective, scope),
    Promise.all(
      objective.children.map(async (c) => ({
        ...c,
        kpi: await getObjectiveKpi(await effectiveObjective(c)),
        todo: await db.objectiveAction.count({
          where: { objectiveId: c.id, status: { in: ["TODO", "IN_PROGRESS"] } },
        }),
      }))
    ),
    loadInScope(objective, scope),
    loadCrawlHealth(scope),
    searchTypesForSites(scope),
    latestAiCitations(objective.id, userId!),
  ]);
  const situations = siteSituations(scope, scoped.inScope, health, pickHub(scope, scoped.inScope, objective.focusTerms), searchTypes);

  // Anything under this objective cannot become its parent.
  const descendants = new Set<string>();
  const collect = (id: string) => {
    for (const o of allObjectives) {
      if (o.parentId === id && !descendants.has(o.id)) {
        descendants.add(o.id);
        collect(o.id);
      }
    }
  };
  collect(objective.id);
  const parentChoices = allObjectives
    .filter((o) => o.id !== objective.id && !descendants.has(o.id))
    .map((o) => ({ id: o.id, title: o.title }));

  const focusDelta = calculatePercentChange(kpi.current.focus.impressions, kpi.previous.focus.impressions);
  const rivalDelta = calculatePercentChange(kpi.current.rival.impressions, kpi.previous.rival.impressions);

  return (
    <div>
      <PageHeader
        eyebrow={
          objective.parent ? (
            <Link href={`/objectives/${objective.parent.id}`} className="hover:underline">
              {objective.parent.title}
            </Link>
          ) : (
            "Objectif"
          )
        }
        title={objective.title}
        description={objective.description ?? undefined}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <DataLagBadge />
            <ObjectiveFormDialog
              mode="edit"
              sites={sites}
              parents={parentChoices}
              triggerVariant="outline"
              initial={{
                id: objective.id,
                title: objective.title,
                description: objective.description ?? "",
                parentId: objective.parentId ?? "",
                siteIds: objective.siteIds,
                focusTerms: objective.focusTerms.join("\n"),
                rivalTerms: objective.rivalTerms.join("\n"),
                targetShare:
                  objective.targetShare != null ? String(Math.round(objective.targetShare * 100)) : "",
                deadline: objective.deadline ? objective.deadline.toISOString().slice(0, 10) : "",
                status: objective.status === "ARCHIVED" ? "ACTIVE" : objective.status,
                entityName: objective.entityName ?? "",
                wikiArticles: objective.wikiArticles.join("\n"),
                mediaBlogs: objective.mediaBlogs.join("\n"),
                guestSites: objective.guestSites.join("\n"),
                socialProfiles: objective.socialProfiles.join("\n"),
                directories: objective.directories.join("\n"),
                rivalSites: objective.rivalSites.join("\n"),
                surfaces: stored.surfaces,
              }}
            />
            <DeleteObjectiveButton objectiveId={objective.id} hasChildren={objective.children.length > 0} />
          </div>
        }
      />

      {/* Scope */}
      <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
        <span>
          <span className="font-medium text-foreground">Sites :</span>{" "}
          {scope.length === 0 ? "aucun" : scope.map((s) => s.domain).join(", ")}
        </span>
        {objective.surfaces.length > 0 && (
          <span>
            <span className="font-medium text-foreground">Canal :</span>{" "}
            {objective.surfaces.map((s) => SURFACE_LABELS[s as Surface] ?? s).join(", ")}
            {inherits && objective.parent && (
              <span className="text-muted-foreground"> · sites et vocabulaire hérités de « {objective.parent.title} »</span>
            )}
          </span>
        )}
        <span>
          <span className="font-medium text-foreground">À défendre :</span>{" "}
          {objective.focusTerms.length ? objective.focusTerms.join(", ") : "—"}
        </span>
        <span>
          <span className="font-medium text-foreground">Concurrents :</span>{" "}
          {objective.rivalTerms.length ? objective.rivalTerms.join(", ") : "—"}
        </span>
        {objective.deadline && (
          <span>
            <span className="font-medium text-foreground">Échéance :</span>{" "}
            {objective.deadline.toLocaleDateString("fr-FR")}
          </span>
        )}
        {objective.entityName && (
          <span>
            <span className="font-medium text-foreground">Entité :</span> {objective.entityName}
          </span>
        )}
        {(objective.mediaBlogs.length > 0 || objective.guestSites.length > 0 || objective.wikiArticles.length > 0 || objective.rivalSites.length > 0 || objective.directories.length > 0) && (
          <span>
            <span className="font-medium text-foreground">Hors site :</span>{" "}
            {[
              objective.mediaBlogs.length ? `${objective.mediaBlogs.length} blog${objective.mediaBlogs.length > 1 ? "s" : ""} de média` : null,
              objective.guestSites.length ? `${objective.guestSites.length} site${objective.guestSites.length > 1 ? "s" : ""} où publier` : null,
              objective.wikiArticles.length ? `${objective.wikiArticles.length} article${objective.wikiArticles.length > 1 ? "s" : ""} Wikipédia` : null,
              objective.rivalSites.length ? `${objective.rivalSites.length} site${objective.rivalSites.length > 1 ? "s" : ""} concurrent${objective.rivalSites.length > 1 ? "s" : ""}` : null,
              objective.directories.length ? `${objective.directories.length} annuaire${objective.directories.length > 1 ? "s" : ""}` : null,
            ]
              .filter(Boolean)
              .join(", ")}
          </span>
        )}
      </div>

      {/* Where each site stands */}
      <SiteSituations rows={situations} hasTerms={scoped.hasTerms} />

      {/* Cited by the answer engines */}
      <AiCitationsPanel objectiveId={objective.id} summary={aiCitations} />

      {/* One subject, several channels, in order */}
      <CoordinatedPlan topics={topics} objectiveTitles={objectiveTitles} />

      {/* KPI */}
      {!kpi.hasTerms ? (
        <div className="panel mb-6 p-5">
          <p className="font-medium text-foreground">Pas encore de mesure</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Ajoutez des termes à défendre et des termes concurrents pour obtenir la part de demande.
            Sans termes, les tâches portent sur toutes les requêtes des sites concernés.
          </p>
        </div>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="panel p-4">
              <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Part de demande</p>
              <p className="mt-1 font-heading text-2xl font-semibold text-foreground">
                {formatShare(kpi.current.share)}
                {objective.targetShare != null && (
                  <span className="ml-1 text-sm font-normal text-muted-foreground">
                    / cible {formatShare(objective.targetShare)}
                  </span>
                )}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {kpi.shareDeltaPts === null
                  ? `sur ${kpi.windowDays} jours`
                  : `${kpi.shareDeltaPts > 0 ? "+" : ""}${kpi.shareDeltaPts} pt vs ${kpi.windowDays} j précédents`}
              </p>
            </div>
            <Mini
              label="Votre vocabulaire"
              bucket={kpi.current.focus}
              delta={focusDelta}
              windowDays={kpi.windowDays}
            />
            <Mini
              label="Vocabulaire concurrent"
              bucket={kpi.current.rival}
              delta={rivalDelta}
              windowDays={kpi.windowDays}
              invert
            />
            <div className="panel p-4">
              <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Position moyenne</p>
              <p className="mt-1 font-heading text-2xl font-semibold text-foreground">
                {kpi.current.focus.avgPosition > 0 ? kpi.current.focus.avgPosition.toFixed(1) : "—"}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                sur les requêtes avec votre vocabulaire
              </p>
            </div>
          </div>

          <div className="mb-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="panel p-5 lg:col-span-2">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="font-heading text-lg font-semibold">Évolution</h3>
                  <p className="text-xs text-muted-foreground">
                    Part de demande par période de {kpi.windowDays} jours, du{" "}
                    {kpi.series[0]?.end ?? "—"} au {kpi.series[kpi.series.length - 1]?.end ?? "—"}
                  </p>
                </div>
                <div className="hidden gap-4 text-right text-xs text-muted-foreground sm:flex">
                  {kpi.series.map((p) => (
                    <div key={p.end}>
                      <p className="font-data text-foreground">{formatShare(p.share)}</p>
                      <p>{p.end.slice(5)}</p>
                    </div>
                  ))}
                </div>
              </div>
              <ShareSparkline
                series={kpi.series}
                target={objective.targetShare}
                className="mt-3 h-20 w-full text-muted-foreground"
              />
            </div>

            <QueryTable
              title="Requêtes avec votre vocabulaire"
              empty="Aucune requête ne contient vos termes sur la période"
              rows={kpi.topFocus}
            />
            <QueryTable
              title="Requêtes avec le vocabulaire concurrent"
              empty="Aucune requête ne contient les termes concurrents"
              rows={kpi.topRival}
              hint="C'est ici que votre terme doit s'installer : ces pages sont vues, elles peuvent porter votre vocabulaire."
            />
          </div>
        </>
      )}

      {/* Sub-objectives */}
      <div className="mb-6">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="font-heading text-lg font-semibold">Sous-objectifs</h3>
          <div className="flex flex-wrap items-center gap-2">
          {!hasChannelChildren && objective.surfaces.length === 0 && <AddChannelsButton objectiveId={objective.id} />}
          <ObjectiveFormDialog
            mode="create"
            sites={sites}
            parents={parentChoices.concat({ id: objective.id, title: objective.title })}
            initial={{ parentId: objective.id, siteIds: objective.siteIds, focusTerms: objective.focusTerms.join("\n"), rivalTerms: objective.rivalTerms.join("\n") }}
            triggerVariant="outline"
            triggerLabel="Ajouter un sous-objectif"
          />
          </div>
        </div>
        {childrenKpi.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucun sous-objectif. Découpez le but en cibles mesurables : un site à faire émerger, un
            terme à imposer.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {childrenKpi.map((c) => (
              <Link
                key={c.id}
                href={`/objectives/${c.id}`}
                className="panel flex items-center gap-4 p-4 transition hover:border-primary/40"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground">
                    {c.surfaces.length > 0 && (
                      <span className="mr-2 rounded-md border border-border/60 px-1.5 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {c.surfaces.map((s) => SURFACE_LABELS[s as Surface] ?? s).join(" · ")}
                      </span>
                    )}
                    {c.title}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {c.todo} tâche{c.todo > 1 ? "s" : ""} à faire
                    {c.kpi.hasTerms && (
                      <>
                        {" "}· part de demande {formatShare(c.kpi.current.share)}
                        {c.targetShare != null && ` / ${formatShare(c.targetShare)}`}
                      </>
                    )}
                  </p>
                </div>
                <ShareSparkline series={c.kpi.series} target={c.targetShare} className="h-10 w-24 text-muted-foreground" />
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </div>
        )}
      </div>

      <ObjectiveTasks objectiveId={objective.id} actions={actions} sites={sites}  channelled={hasChannelChildren} />
    </div>
  );
}

function Mini({
  label,
  bucket,
  delta,
  windowDays,
  invert = false,
}: {
  label: string;
  bucket: Bucket;
  delta: number;
  windowDays: number;
  invert?: boolean;
}) {
  const good = invert ? delta < 0 : delta > 0;
  return (
    <div className="panel p-4">
      <p className="truncate text-[11px] uppercase tracking-[0.14em] text-muted-foreground" title={label}>
        {label}
      </p>
      <p className="mt-1 font-heading text-2xl font-semibold text-foreground">
        {bucket.impressions.toLocaleString("fr-FR")}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        <span className={cn(delta !== 0 && (good ? "text-signal" : "text-danger"))}>
          {formatDeltaPercent(delta)}
        </span>{" "}
        impressions vs {windowDays} j précédents · {bucket.queries} requête{bucket.queries > 1 ? "s" : ""}
      </p>
    </div>
  );
}

function QueryTable({
  title,
  rows,
  empty,
  hint,
}: {
  title: string;
  rows: QueryRow[];
  empty: string;
  hint?: string;
}) {
  return (
    <div className="panel overflow-hidden">
      <div className="px-5 pt-5">
        <h3 className="font-heading text-lg font-semibold">{title}</h3>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="overflow-x-auto px-5 pb-4 pt-3">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                <th className="py-2 text-left">Requête</th>
                <th className="py-2 text-left">Site</th>
                <th className="py-2 text-right">Pos</th>
                <th className="py-2 text-right">Impr.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {rows.map((r) => (
                <tr key={`${r.siteId}-${r.query}`}>
                  <td className="py-2 font-medium">{r.query}</td>
                  <td className="max-w-[160px] truncate py-2 text-xs text-muted-foreground">{r.domain}</td>
                  <td className="py-2 text-right">
                    <PositionBadge position={r.position} />
                  </td>
                  <td className="py-2 text-right">
                    <NumCell value={r.impressions} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
