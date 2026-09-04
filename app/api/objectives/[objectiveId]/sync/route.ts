import { syncObjectiveActions } from "@/lib/objectives";
import { requireOwnedObjective, requireUserId } from "@/lib/objective-api";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ objectiveId: string }> }
) {
  try {
    const userId = await requireUserId();
    if (userId instanceof Response) return userId;
    const { objectiveId } = await params;
    const objective = await requireOwnedObjective(userId, objectiveId);
    if (objective instanceof Response) return objective;

    const result = await syncObjectiveActions(objectiveId);
    return Response.json(result);
  } catch (error) {
    console.error("Objective sync error:", error);
    return Response.json({ error: "Échec du recalcul des tâches" }, { status: 500 });
  }
}
