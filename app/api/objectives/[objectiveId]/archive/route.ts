import { archiveObjectiveTree } from "@/lib/objectives";
import { requireOwnedObjective, requireUserId } from "@/lib/objective-api";

/** Hides this objective and its whole subtree from every normal view,
 *  without deleting a row. Reversible from the archived list. */
export async function POST(_req: Request, { params }: { params: Promise<{ objectiveId: string }> }) {
  try {
    const userId = await requireUserId();
    if (userId instanceof Response) return userId;
    const { objectiveId } = await params;
    const objective = await requireOwnedObjective(userId, objectiveId);
    if (objective instanceof Response) return objective;

    const archived = await archiveObjectiveTree(objectiveId);
    return Response.json({ archived });
  } catch (error) {
    console.error("Objective archive error:", error);
    return Response.json({ error: "Échec de l'archivage" }, { status: 500 });
  }
}
