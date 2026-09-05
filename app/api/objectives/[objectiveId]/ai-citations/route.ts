import { requireOwnedObjective, requireUserId } from "@/lib/objective-api";
import { latestAiCitations, runAiCitations } from "@/lib/ai-citations";
import { syncObjectiveActions } from "@/lib/objectives";

export async function GET(_req: Request, { params }: { params: Promise<{ objectiveId: string }> }) {
  const userId = await requireUserId();
  if (userId instanceof Response) return userId;
  const { objectiveId } = await params;
  const objective = await requireOwnedObjective(userId, objectiveId);
  if (objective instanceof Response) return objective;
  return Response.json(await latestAiCitations(objectiveId, userId));
}

/** One measurement: the prompts go to every configured engine, then the
 *  tasks are recalculated so the prompts without a citation show up. */
export async function POST(_req: Request, { params }: { params: Promise<{ objectiveId: string }> }) {
  try {
    const userId = await requireUserId();
    if (userId instanceof Response) return userId;
    const { objectiveId } = await params;
    const objective = await requireOwnedObjective(userId, objectiveId);
    if (objective instanceof Response) return objective;

    const run = await runAiCitations(objectiveId);
    if (run.rows.length > 0) await syncObjectiveActions(objectiveId);
    return Response.json({ ...run, summary: await latestAiCitations(objectiveId, userId) });
  } catch (error) {
    console.error("AI citations error:", error);
    return Response.json({ error: "Échec de la mesure « Cité par les IA »" }, { status: 500 });
  }
}
