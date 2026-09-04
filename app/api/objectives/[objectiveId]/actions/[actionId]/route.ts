import { db } from "@/lib/db";
import { requireOwnedObjective, requireUserId } from "@/lib/objective-api";
import type { ActionStatus } from "@prisma/client";

const STATUSES = new Set<ActionStatus>(["TODO", "IN_PROGRESS", "DONE", "DISMISSED"]);

type Ctx = { params: Promise<{ objectiveId: string; actionId: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const userId = await requireUserId();
    if (userId instanceof Response) return userId;
    const { objectiveId, actionId } = await params;
    const objective = await requireOwnedObjective(userId, objectiveId);
    if (objective instanceof Response) return objective;

    const action = await db.objectiveAction.findUnique({ where: { id: actionId } });
    if (!action || action.objectiveId !== objectiveId) {
      return Response.json({ error: "Tâche introuvable" }, { status: 404 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      status?: unknown;
      notes?: unknown;
      title?: unknown;
      detail?: unknown;
      priority?: unknown;
    };

    const data: {
      status?: ActionStatus;
      doneAt?: Date | null;
      notes?: string | null;
      title?: string;
      detail?: string | null;
      priority?: number;
    } = {};

    if (body.status !== undefined) {
      if (typeof body.status !== "string" || !STATUSES.has(body.status as ActionStatus)) {
        return Response.json({ error: "Statut invalide" }, { status: 400 });
      }
      data.status = body.status as ActionStatus;
      data.doneAt = data.status === "DONE" ? new Date() : null;
    }
    if (body.notes !== undefined) {
      data.notes =
        typeof body.notes === "string" && body.notes.trim() ? body.notes.trim().slice(0, 2000) : null;
    }
    if (body.title !== undefined) {
      const title = typeof body.title === "string" ? body.title.trim() : "";
      if (!title) return Response.json({ error: "Le titre est obligatoire" }, { status: 400 });
      data.title = title.slice(0, 300);
    }
    if (body.detail !== undefined) {
      data.detail =
        typeof body.detail === "string" && body.detail.trim() ? body.detail.trim().slice(0, 2000) : null;
    }
    if (body.priority !== undefined) {
      const n = Number(body.priority);
      if (!Number.isFinite(n)) return Response.json({ error: "Priorité invalide" }, { status: 400 });
      data.priority = Math.max(1, Math.min(100, Math.round(n)));
    }

    const updated = await db.objectiveAction.update({ where: { id: actionId }, data });
    return Response.json(updated);
  } catch (error) {
    console.error("Objective action PATCH error:", error);
    return Response.json({ error: "Échec de la mise à jour de la tâche" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const userId = await requireUserId();
    if (userId instanceof Response) return userId;
    const { objectiveId, actionId } = await params;
    const objective = await requireOwnedObjective(userId, objectiveId);
    if (objective instanceof Response) return objective;

    const action = await db.objectiveAction.findUnique({
      where: { id: actionId },
      select: { objectiveId: true },
    });
    if (!action || action.objectiveId !== objectiveId) {
      return Response.json({ error: "Tâche introuvable" }, { status: 404 });
    }

    await db.objectiveAction.delete({ where: { id: actionId } });
    return Response.json({ success: true });
  } catch (error) {
    console.error("Objective action DELETE error:", error);
    return Response.json({ error: "Échec de la suppression de la tâche" }, { status: 500 });
  }
}
