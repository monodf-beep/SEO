import { db } from "@/lib/db";
import { getObjectiveKpi, resolveScope, syncObjectiveActions } from "@/lib/objectives";
import {
  parseObjectivePayload,
  requireOwnedObjective,
  requireUserId,
  type ObjectivePayload,
} from "@/lib/objective-api";

type Ctx = { params: Promise<{ objectiveId: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const userId = await requireUserId();
    if (userId instanceof Response) return userId;
    const { objectiveId } = await params;
    const objective = await requireOwnedObjective(userId, objectiveId);
    if (objective instanceof Response) return objective;

    const [scope, children, actions] = await Promise.all([
      resolveScope(objective),
      db.objective.findMany({ where: { parentId: objectiveId }, orderBy: { createdAt: "asc" } }),
      db.objectiveAction.findMany({
        where: { objectiveId },
        orderBy: [{ status: "asc" }, { priority: "desc" }, { createdAt: "asc" }],
      }),
    ]);
    const kpi = await getObjectiveKpi(objective, scope);

    return Response.json({ ...objective, scope, children, actions, kpi });
  } catch (error) {
    console.error("Objective GET error:", error);
    return Response.json({ error: "Échec du chargement de l'objectif" }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const userId = await requireUserId();
    if (userId instanceof Response) return userId;
    const { objectiveId } = await params;
    const objective = await requireOwnedObjective(userId, objectiveId);
    if (objective instanceof Response) return objective;

    const body = (await req.json().catch(() => ({}))) as ObjectivePayload;
    const { data, errors } = await parseObjectivePayload(userId, body, {
      partial: true,
      selfId: objectiveId,
    });
    if (errors.length > 0) {
      return Response.json({ error: errors.join(" · ") }, { status: 400 });
    }

    const updated = await db.objective.update({ where: { id: objectiveId }, data });

    // A scope change invalidates the generated actions: rebuild them.
    const scopeChanged =
      data.siteIds !== undefined ||
      data.focusTerms !== undefined ||
      data.rivalTerms !== undefined ||
      data.entityName !== undefined ||
      data.wikiArticles !== undefined ||
      data.mediaBlogs !== undefined ||
      data.guestSites !== undefined ||
      data.socialProfiles !== undefined ||
      data.directories !== undefined ||
      data.rivalSites !== undefined ||
      data.surfaces !== undefined;
    const sync = scopeChanged ? await syncObjectiveActions(objectiveId) : null;

    return Response.json({ ...updated, sync });
  } catch (error) {
    console.error("Objective PATCH error:", error);
    return Response.json({ error: "Échec de la mise à jour de l'objectif" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const userId = await requireUserId();
    if (userId instanceof Response) return userId;
    const { objectiveId } = await params;
    const objective = await requireOwnedObjective(userId, objectiveId);
    if (objective instanceof Response) return objective;

    // Children and actions cascade at the database level.
    await db.objective.delete({ where: { id: objectiveId } });
    return Response.json({ success: true });
  } catch (error) {
    console.error("Objective DELETE error:", error);
    return Response.json({ error: "Échec de la suppression de l'objectif" }, { status: 500 });
  }
}
