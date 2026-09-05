import { restoreObjectiveTree } from "@/lib/objectives";
import { requireOwnedObjective, requireUserId } from "@/lib/objective-api";

export async function POST(_req: Request, { params }: { params: Promise<{ objectiveId: string }> }) {
  try {
    const userId = await requireUserId();
    if (userId instanceof Response) return userId;
    const { objectiveId } = await params;
    const objective = await requireOwnedObjective(userId, objectiveId);
    if (objective instanceof Response) return objective;

    const restored = await restoreObjectiveTree(objectiveId);
    return Response.json({ restored });
  } catch (error) {
    console.error("Objective restore error:", error);
    return Response.json({ error: "Échec de la restauration" }, { status: 500 });
  }
}
