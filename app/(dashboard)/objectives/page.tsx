import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatShare, getObjectiveKpi, type ObjectiveKpi } from "@/lib/objectives";
import { objectiveTemplates } from "@/lib/objective-templates";
import { SURFACE_LABELS, type Surface } from "@/lib/objective-surfaces";
import { PageHeader } from "@/components/ui/page-header";
import { DataLagBadge } from "@/components/ui/data-lag-badge";
import { ObjectiveFormDialog } from "@/components/objectives/objective-form-dialog";
import { TemplatePicker } from "@/components/objectives/objective-buttons";
import { ShareSparkline } from "@/components/objectives/share-sparkline";
import { cn } from "@/lib/utils";
import { ChevronRight, Target } from "lucide-react";

type Row = {
  id: string;
  parentId: string | null;
  title: string;
  description: string | null;
  status: "ACTIVE" | "PAUSED" | "DONE";
  siteIds: string[];
  surfaces: string[];
  targetShare: number | null;
  focusTerms: string[];
  rivalTerms: string[];
  userId: string;
  _count: { children: number; actions: number };
  kpi: ObjectiveKpi;
};

const STATUS_LABEL = { ACTIVE: "Actif", PAUSED: "En pause", DONE: "Atteint" } as const;

export default async function ObjectivesPage() {
  const session = await auth();
  const userId = session?.user?.id;

  const [objectives, sites] = await Promise.all([
    db.objective.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      include: {
        _count: {
          select: {
            children: true,
            actions: { where: { status: { in: ["TODO", "IN_PROGRESS"] } } },
          },
        },
      },
    }),
    db.site.findMany({
      where: { userId },
      select: { id: true, domain: true },
      orderBy: { domain: "asc" },
    }),
  ]);

  const rows: Row[] = await Promise.all(
    objectives.map(async (o) => ({ ...o, kpi: await getObjectiveKpi(o) }))
  );

  const parents = rows.map((r) => ({ id: r.id, title: r.title }));
  const templates = objectiveTemplates.map((t) => ({ key: t.key, label: t.label, summary: t.summary }));

  if (rows.length === 0) {
    return (
      <div>
        <PageHeader
          eyebrow="Pilotage"
          title="Objectifs"
          description="Partez d'un but, pas d'un site : la plateforme mesure la part de demande de votre vocabulaire et en déduit les tâches à effectuer sur chacun de vos sites."
        />
        <div className="panel px-6 py-14 text-center">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl bg-accent text-primary shadow-[var(--shadow-1)]">
            <Target className="size-5" />
          </div>
          <h3 className="font-heading text-atom-subheader font-semibold text-foreground">
            Aucun objectif pour le moment
          </h3>
          <p className="mx-auto mt-2 max-w-lg text-atom-body text-muted-foreground">
            Un objectif porte sur un ou plusieurs sites, des termes à défendre et des termes
            concurrents à capter. Les tâches sont générées à partir de vos données Search Console
            et de vos crawls.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <TemplatePicker templates={templates} variant="default" />
            <ObjectiveFormDialog
              mode="create"
              sites={sites}
              parents={[]}
              triggerVariant="outline"
              triggerLabel="Créer un objectif vide"
            />
          </div>
        </div>
      </div>
    );
  }

  const roots = rows.filter((r) => !r.parentId || !rows.some((p) => p.id === r.parentId));
  const childrenOf = (id: string) => rows.filter((r) => r.parentId === id);
  // A goal declined by channel keeps its tasks in the children: count them with it.
  const todoOf = (row: Row): number => row._count.actions + childrenOf(row.id).reduce((n, c) => n + todoOf(c), 0);

  return (
    <div>
      <PageHeader
        eyebrow="Pilotage"
        title="Objectifs"
        description="La part de demande mesure la place de votre vocabulaire face au vocabulaire concurrent, sur 28 jours, dans les impressions Search Console de vos sites."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <DataLagBadge />
            <TemplatePicker templates={templates} />
            <ObjectiveFormDialog mode="create" sites={sites} parents={parents} />
          </div>
        }
      />

      <div className="space-y-4">
        {roots.map((root) => (
          <div key={root.id} className="space-y-2">
            <ObjectiveCard row={root} siteCount={sites.length} todo={todoOf(root)} />
            {childrenOf(root.id).map((child) => (
              <div key={child.id} className="ml-4 border-l-2 border-border/60 pl-4 sm:ml-8">
                <ObjectiveCard row={child} siteCount={sites.length} todo={todoOf(child)} />
                {childrenOf(child.id).map((grand) => (
                  <div key={grand.id} className="ml-4 mt-2 border-l-2 border-border/60 pl-4">
                    <ObjectiveCard row={grand} siteCount={sites.length} todo={todoOf(grand)} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function ObjectiveCard({ row, siteCount, todo }: { row: Row; siteCount: number; todo: number }) {
  const share = row.kpi.current.share;
  const scopeLabel =
    row.siteIds.length === 0 ? `Tous les sites (${siteCount})` : `${row.siteIds.length} site${row.siteIds.length > 1 ? "s" : ""}`;

  return (
    <Link
      href={`/objectives/${row.id}`}
      className="panel flex flex-col gap-4 p-5 transition hover:border-primary/40 sm:flex-row sm:items-center"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
              row.status === "ACTIVE" && "bg-signal-muted text-signal",
              row.status === "PAUSED" && "bg-muted text-muted-foreground",
              row.status === "DONE" && "bg-primary/15 text-primary"
            )}
          >
            {STATUS_LABEL[row.status]}
          </span>
          {row.surfaces.length > 0 && (
            <span className="rounded border border-border/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {row.surfaces.map((s) => SURFACE_LABELS[s as Surface] ?? s).join(" · ")}
            </span>
          )}
          <span className="text-[11px] text-muted-foreground">{scopeLabel}</span>
          {row._count.children > 0 && (
            <span className="text-[11px] text-muted-foreground">
              · {row._count.children} sous-objectif{row._count.children > 1 ? "s" : ""}
            </span>
          )}
        </div>
        <p className="mt-1.5 font-heading text-lg font-semibold text-foreground">{row.title}</p>
        {row.description && (
          <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{row.description}</p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-6">
        <div className="text-right">
          <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Part de demande</p>
          <p className="font-heading text-2xl font-semibold text-foreground">
            {row.kpi.hasTerms ? formatShare(share) : "—"}
            {row.targetShare != null && share !== null && (
              <span className="ml-1 text-sm font-normal text-muted-foreground">
                / {formatShare(row.targetShare)}
              </span>
            )}
          </p>
        </div>
        <ShareSparkline
          series={row.kpi.series}
          target={row.targetShare}
          className="hidden h-12 w-32 text-muted-foreground sm:block"
        />
        <div className="text-right">
          <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">À faire</p>
          <p className="font-heading text-2xl font-semibold text-foreground">{todo}</p>
        </div>
        <ChevronRight className="size-4 text-muted-foreground" />
      </div>
    </Link>
  );
}
