import { requireOwnedObjective, requireUserId } from "@/lib/objective-api";
import { createChannelChildren, syncObjectiveActions } from "@/lib/objectives";

/** Decline an objective by channel: one child per surface, inheriting the
 *  parent's sites and vocabulary; then the parent keeps only what no child
 *  covers. */
export async function POST(_req: Request, { params }: { params: Promise<{ objectiveId: string }> }) {
  try {
    const userId = await requireUserId();
    if (userId instanceof Response) return userId;
    const { objectiveId } = await params;
    const objective = await requireOwnedObjective(userId, objectiveId);
    if (objective instanceof Response) return objective;

    const created = await createChannelChildren(userId, objectiveId);
    for (const id of created) await syncObjectiveActions(id);
    await syncObjectiveActions(objectiveId);
    return Response.json({ created }, { status: 201 });
  } catch (error) {
    console.error("Objective channels error:", error);
    return Response.json({ error: "Échec de la déclinaison par canal" }, { status: 500 });
  }
}
