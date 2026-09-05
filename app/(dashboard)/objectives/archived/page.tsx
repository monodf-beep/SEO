import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { RestoreObjectiveButton, PermanentlyDeleteObjectiveButton } from "@/components/objectives/objective-buttons";

/** Where an archived objective goes: restore it, or delete it for good. */
export default async function ArchivedObjectivesPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  const rows = await db.objective.findMany({
    where: { userId, status: "ARCHIVED" },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, parentId: true, updatedAt: true, _count: { select: { children: true } } },
  });
  // Only the top of each archived subtree needs its own row: restoring or
  // deleting it takes its archived descendants with it.
  const ids = new Set(rows.map((r) => r.id));
  const topLevel = rows.filter((r) => !r.parentId || !ids.has(r.parentId));

  return (
    <div>
      <PageHeader
        eyebrow={<Link href="/objectives" className="hover:underline">Objectifs</Link>}
        title="Objectifs archivés"
        description="Un objectif archivé et ses sous-objectifs restent en base, hors de vue. Restaurez-le pour le retrouver, ou supprimez-le définitivement — cette dernière action est irréversible."
      />
      {topLevel.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun objectif archivé.</p>
      ) : (
        <div className="space-y-3">
          {topLevel.map((r) => (
            <div key={r.id} className="panel flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="font-medium text-foreground">{r.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Archivé le {r.updatedAt.toLocaleDateString("fr-FR")}
                  {r._count.children > 0 && ` · ${r._count.children} sous-objectif${r._count.children > 1 ? "s" : ""} avec lui`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <RestoreObjectiveButton objectiveId={r.id} />
                <PermanentlyDeleteObjectiveButton objectiveId={r.id} hasChildren={r._count.children > 0} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
