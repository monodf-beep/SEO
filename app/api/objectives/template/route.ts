import { createObjectiveFromTemplate } from "@/lib/objectives";
import { objectiveTemplates } from "@/lib/objective-templates";
import { requireUserId } from "@/lib/objective-api";

export async function GET() {
  const userId = await requireUserId();
  if (userId instanceof Response) return userId;
  return Response.json(
    objectiveTemplates.map((t) => ({ key: t.key, label: t.label, summary: t.summary }))
  );
}

export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    if (userId instanceof Response) return userId;

    const body = (await req.json().catch(() => ({}))) as { key?: unknown };
    const key = typeof body.key === "string" ? body.key : "";
    if (!objectiveTemplates.some((t) => t.key === key)) {
      return Response.json({ error: "Modèle inconnu" }, { status: 400 });
    }

    const result = await createObjectiveFromTemplate(userId, key);
    return Response.json(result, { status: 201 });
  } catch (error) {
    console.error("Objective template POST error:", error);
    return Response.json({ error: "Échec de la création depuis le modèle" }, { status: 500 });
  }
}
