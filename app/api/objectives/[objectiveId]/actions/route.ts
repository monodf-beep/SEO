import { db } from "@/lib/db";
import { requireOwnedObjective, requireUserId } from "@/lib/objective-api";
import type { ActionType } from "@prisma/client";

const TYPES = new Set<ActionType>([
  "CONTENT_NEW",
  "CONTENT_UPDATE",
  "TERMINOLOGY",
  "INTERNAL_LINK",
  "BACKLINK",
  "WIKIPEDIA",
  "PRESS",
  "PROFILE",
  "TECHNICAL",
  "OTHER",
]);

type Ctx = { params: Promise<{ objectiveId: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const userId = await requireUserId();
    if (userId instanceof Response) return userId;
    const { objectiveId } = await params;
    const objective = await requireOwnedObjective(userId, objectiveId);
    if (objective instanceof Response) return objective;

    const actions = await db.objectiveAction.findMany({
      where: { objectiveId },
      orderBy: [{ status: "asc" }, { priority: "desc" }, { createdAt: "asc" }],
    });
    return Response.json(actions);
  } catch (error) {
    console.error("Objective actions GET error:", error);
    return Response.json({ error: "Échec du chargement des tâches" }, { status: 500 });
  }
}

/** Creates a manual task on the objective. */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const userId = await requireUserId();
    if (userId instanceof Response) return userId;
    const { objectiveId } = await params;
    const objective = await requireOwnedObjective(userId, objectiveId);
    if (objective instanceof Response) return objective;

    const body = (await req.json().catch(() => ({}))) as {
      title?: unknown;
      detail?: unknown;
      type?: unknown;
      siteId?: unknown;
      url?: unknown;
      query?: unknown;
      priority?: unknown;
    };

    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) {
      return Response.json({ error: "Le titre est obligatoire" }, { status: 400 });
    }
    const type =
      typeof body.type === "string" && TYPES.has(body.type as ActionType)
        ? (body.type as ActionType)
        : "OTHER";

    let siteId: string | null = null;
    if (typeof body.siteId === "string" && body.siteId) {
      const site = await db.site.findUnique({
        where: { id: body.siteId },
        select: { userId: true },
      });
      if (!site || site.userId !== userId) {
        return Response.json({ error: "Site introuvable" }, { status: 400 });
      }
      siteId = body.siteId;
    }

    const priorityRaw = Number(body.priority);
    const priority = Number.isFinite(priorityRaw)
      ? Math.max(1, Math.min(100, Math.round(priorityRaw)))
      : 50;

    const action = await db.objectiveAction.create({
      data: {
        objectiveId,
        siteId,
        type,
        title: title.slice(0, 300),
        detail: typeof body.detail === "string" && body.detail.trim() ? body.detail.trim().slice(0, 2000) : null,
        url: typeof body.url === "string" && body.url.trim() ? body.url.trim().slice(0, 1000) : null,
        query: typeof body.query === "string" && body.query.trim() ? body.query.trim().slice(0, 300) : null,
        priority,
        source: "manual",
      },
    });

    return Response.json(action, { status: 201 });
  } catch (error) {
    console.error("Objective actions POST error:", error);
    return Response.json({ error: "Échec de la création de la tâche" }, { status: 500 });
  }
}
