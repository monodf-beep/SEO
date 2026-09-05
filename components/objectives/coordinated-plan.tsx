import Link from "next/link";
import type { ObjectiveAction } from "@prisma/client";
import { normalizeTerm } from "@/lib/objective-terms";
import { SURFACE_LABELS, surfaceOf, type Surface } from "@/lib/objective-surfaces";

/** The order channels play in on one subject: the page first, then the
 *  image made for it, the post that carries both, the piece elsewhere, and
 *  the answer surfaces that follow. */
const SEQUENCE: Surface[] = ["seo", "images", "social", "presse", "aeo", "geo"];

type Row = ObjectiveAction & { objectiveId: string };

export type Topic = {
  query: string;
  priority: number;
  steps: Array<{ surface: Surface; action: Row }>;
};

/** Subjects that at least two channels work on, most valuable first. */
export function coordinatedTopics(actions: Row[], limit = 8): Topic[] {
  const byQuery = new Map<string, { query: string; rows: Row[] }>();
  for (const a of actions) {
    if (!a.query || (a.status !== "TODO" && a.status !== "IN_PROGRESS")) continue;
    const key = normalizeTerm(a.query);
    const cur = byQuery.get(key) ?? { query: a.query, rows: [] };
    cur.rows.push(a);
    byQuery.set(key, cur);
  }
  const topics: Topic[] = [];
  for (const { query, rows } of byQuery.values()) {
    const bySurface = new Map<Surface, Row>();
    for (const r of rows) {
      const s = surfaceOf(r.source, r.type);
      const prev = bySurface.get(s);
      if (!prev || r.priority > prev.priority) bySurface.set(s, r);
    }
    if (bySurface.size < 2) continue;
    topics.push({
      query,
      priority: rows.reduce((sum, r) => sum + r.priority, 0),
      steps: SEQUENCE.filter((s) => bySurface.has(s)).map((s) => ({ surface: s, action: bySurface.get(s)! })),
    });
  }
  return topics.sort((a, b) => b.priority - a.priority).slice(0, limit);
}

export function CoordinatedPlan({
  topics,
  objectiveTitles,
}: {
  topics: Topic[];
  objectiveTitles: Map<string, string>;
}) {
  if (topics.length === 0) return null;
  return (
    <div className="panel mb-6 p-5">
      <h3 className="font-heading text-lg font-semibold">Plan coordonné par sujet</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Les requêtes sur lesquelles plusieurs canaux ont quelque chose à faire, dans l&apos;ordre où ils s&apos;enchaînent : la page, l&apos;image qui la sert, le post qui porte les deux, le billet ailleurs, puis les réponses et les IA.
      </p>
      <ol className="mt-4 space-y-4">
        {topics.map((t, i) => (
          <li key={t.query} className="rounded-xl border border-border/60 p-4">
            <p className="font-medium text-foreground">
              <span className="mr-2 font-data text-muted-foreground">{i + 1}.</span>« {t.query} »
            </p>
            <ol className="mt-2 grid gap-2 sm:grid-cols-2">
              {t.steps.map(({ surface, action }, j) => (
                <li key={action.id} className="flex gap-2 text-sm">
                  <span className="mt-0.5 shrink-0 rounded-md border border-border/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {j + 1} · {SURFACE_LABELS[surface]}
                  </span>
                  <span className="min-w-0">
                    <Link href={`/objectives/${action.objectiveId}`} className="text-foreground hover:underline">
                      {action.title}
                    </Link>
                    {objectiveTitles.get(action.objectiveId) && (
                      <span className="block truncate text-xs text-muted-foreground">{objectiveTitles.get(action.objectiveId)}</span>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ol>
    </div>
  );
}
