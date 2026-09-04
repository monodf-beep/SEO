import { db } from "@/lib/db";
import { getObjectiveKpi, syncObjectiveActions } from "@/lib/objectives";
import {
  parseObjectivePayload,
  requireUserId,
  type ObjectivePayload,
} from "@/lib/objective-api";

export async function GET() {
  try {
    const userId = await requireUserId();
    if (userId instanceof Response) return userId;

    const objectives = await db.objective.findMany({
      where: { userId },
      orderBy: [{ parentId: "asc" }, { createdAt: "asc" }],
      include: { _count: { select: { children: true, actions: true } } },
    });

    const withKpi = await Promise.all(
      objectives.map(async (o) => ({
        ...o,
        kpi: await getObjectiveKpi(o),
      }))
    );

    return Response.json(withKpi);
  } catch (error) {
    console.error("Objectives GET error:", error);
    return Response.json({ error: "Échec du chargement des objectifs" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    if (userId instanceof Response) return userId;

    const body = (await req.json().catch(() => ({}))) as ObjectivePayload;
    const { data, errors } = await parseObjectivePayload(userId, body);
    if (errors.length > 0) {
      return Response.json({ error: errors.join(" · ") }, { status: 400 });
    }

    const objective = await db.objective.create({
      data: {
        userId,
        title: data.title!,
        description: data.description ?? null,
        parentId: data.parentId ?? null,
        siteIds: data.siteIds ?? [],
        focusTerms: data.focusTerms ?? [],
        rivalTerms: data.rivalTerms ?? [],
        targetShare: data.targetShare ?? null,
        deadline: data.deadline ?? null,
        entityName: data.entityName ?? null,
        wikiArticles: data.wikiArticles ?? [],
        mediaBlogs: data.mediaBlogs ?? [],
        guestSites: data.guestSites ?? [],
        socialProfiles: data.socialProfiles ?? [],
        directories: data.directories ?? [],
        rivalSites: data.rivalSites ?? [],
      },
    });

    const sync = await syncObjectiveActions(objective.id);

    return Response.json({ ...objective, sync }, { status: 201 });
  } catch (error) {
    console.error("Objectives POST error:", error);
    return Response.json({ error: "Échec de la création de l'objectif" }, { status: 500 });
  }
}
