/**
 * Shared request helpers for the objective routes: auth, ownership, and
 * parsing of the objective payload the create/update forms send.
 */

import { auth } from "@/lib/auth";
import { SURFACE_ORDER } from "@/lib/objective-surfaces";
import { db } from "@/lib/db";
import { parseTerms } from "@/lib/objectives";

export async function requireUserId(): Promise<string | Response> {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Non autorisé" }, { status: 401 });
  }
  return session.user.id;
}

/** Returns the objective when it belongs to the user, else a 404 response. */
export async function requireOwnedObjective(userId: string, objectiveId: string) {
  const objective = await db.objective.findUnique({ where: { id: objectiveId } });
  if (!objective || objective.userId !== userId) {
    return Response.json({ error: "Introuvable" }, { status: 404 });
  }
  return objective;
}

export type ObjectivePayload = {
  title?: unknown;
  description?: unknown;
  parentId?: unknown;
  siteIds?: unknown;
  focusTerms?: unknown;
  rivalTerms?: unknown;
  targetShare?: unknown;
  deadline?: unknown;
  status?: unknown;
  entityName?: unknown;
  wikiArticles?: unknown;
  mediaBlogs?: unknown;
  guestSites?: unknown;
  socialProfiles?: unknown;
  directories?: unknown;
  rivalSites?: unknown;
  surfaces?: unknown;
};

const STATUSES = new Set(["ACTIVE", "PAUSED", "DONE"]);

/**
 * Validates and normalizes an objective payload. Unknown site ids and a
 * parent that the user does not own are rejected rather than silently
 * dropped, so a stale form cannot attach an objective to the wrong tree.
 */
export async function parseObjectivePayload(
  userId: string,
  body: ObjectivePayload,
  { partial = false, selfId }: { partial?: boolean; selfId?: string } = {}
) {
  const errors: string[] = [];
  const data: {
    title?: string;
    description?: string | null;
    parentId?: string | null;
    siteIds?: string[];
    focusTerms?: string[];
    rivalTerms?: string[];
    targetShare?: number | null;
    deadline?: Date | null;
    status?: "ACTIVE" | "PAUSED" | "DONE";
    entityName?: string | null;
    wikiArticles?: string[];
    mediaBlogs?: string[];
    guestSites?: string[];
    socialProfiles?: string[];
    directories?: string[];
    rivalSites?: string[];
    surfaces?: string[];
  } = {};

  if (body.title !== undefined || !partial) {
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) errors.push("Le titre est obligatoire");
    else data.title = title.slice(0, 200);
  }

  if (body.description !== undefined) {
    data.description =
      typeof body.description === "string" && body.description.trim()
        ? body.description.trim().slice(0, 2000)
        : null;
  }

  if (body.parentId !== undefined) {
    if (body.parentId === null || body.parentId === "") {
      data.parentId = null;
    } else if (typeof body.parentId === "string") {
      if (selfId && body.parentId === selfId) {
        errors.push("Un objectif ne peut pas être son propre parent");
      } else {
        const parent = await db.objective.findUnique({
          where: { id: body.parentId },
          select: { userId: true },
        });
        if (!parent || parent.userId !== userId) errors.push("Objectif parent introuvable");
        else data.parentId = body.parentId;
      }
    } else {
      errors.push("parentId invalide");
    }
  }

  if (body.siteIds !== undefined) {
    if (!Array.isArray(body.siteIds) || body.siteIds.some((s) => typeof s !== "string")) {
      errors.push("siteIds doit être une liste d'identifiants");
    } else {
      const ids = [...new Set(body.siteIds as string[])];
      if (ids.length > 0) {
        const owned = await db.site.findMany({
          where: { userId, id: { in: ids } },
          select: { id: true },
        });
        if (owned.length !== ids.length) errors.push("Un des sites n'existe pas");
      }
      data.siteIds = ids;
    }
  }

  if (body.focusTerms !== undefined) {
    data.focusTerms = parseTerms(body.focusTerms as string | string[]).slice(0, 50);
  }
  if (body.rivalTerms !== undefined) {
    data.rivalTerms = parseTerms(body.rivalTerms as string | string[]).slice(0, 50);
  }

  if (body.targetShare !== undefined) {
    if (body.targetShare === null || body.targetShare === "") {
      data.targetShare = null;
    } else {
      const n = Number(body.targetShare);
      if (!Number.isFinite(n) || n < 0 || n > 100) errors.push("La cible doit être entre 0 et 100 %");
      // Accept both 0..1 and 0..100.
      else data.targetShare = n > 1 ? n / 100 : n;
    }
  }

  if (body.deadline !== undefined) {
    if (body.deadline === null || body.deadline === "") {
      data.deadline = null;
    } else {
      const d = new Date(String(body.deadline));
      if (Number.isNaN(d.getTime())) errors.push("Échéance invalide");
      else data.deadline = d;
    }
  }

  if (body.entityName !== undefined) {
    data.entityName =
      typeof body.entityName === "string" && body.entityName.trim()
        ? body.entityName.trim().slice(0, 200)
        : null;
  }
  if (body.surfaces !== undefined) {
    const raw = Array.isArray(body.surfaces) ? body.surfaces : typeof body.surfaces === "string" ? body.surfaces.split(/[,\s]+/) : [];
    data.surfaces = [...new Set(raw.filter((s): s is string => typeof s === "string" && (SURFACE_ORDER as string[]).includes(s)))];
  }
  for (const key of ["wikiArticles", "mediaBlogs", "guestSites", "socialProfiles", "directories", "rivalSites"] as const) {
    if (body[key] !== undefined) {
      data[key] = parseTerms(body[key] as string | string[]).slice(0, 50);
    }
  }

  if (body.status !== undefined) {
    if (typeof body.status === "string" && STATUSES.has(body.status)) {
      data.status = body.status as "ACTIVE" | "PAUSED" | "DONE";
    } else {
      errors.push("Statut invalide");
    }
  }

  return { data, errors };
}
