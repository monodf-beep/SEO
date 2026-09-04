import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

/** Chooses which linked Google account reads Search Console for a site. */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ siteId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Non autorisé" }, { status: 401 });
    }
    const { siteId } = await params;
    const site = await db.site.findUnique({ where: { id: siteId }, select: { userId: true } });
    if (!site || site.userId !== session.user.id) {
      return Response.json({ error: "Site introuvable" }, { status: 404 });
    }

    const body = (await req.json().catch(() => ({}))) as { googleAccountId?: unknown };
    let googleAccountId: string | null = null;
    if (typeof body.googleAccountId === "string" && body.googleAccountId) {
      const account = await db.googleAccount.findUnique({
        where: { id: body.googleAccountId },
        select: { userId: true },
      });
      if (!account || account.userId !== session.user.id) {
        return Response.json({ error: "Compte Google introuvable" }, { status: 400 });
      }
      googleAccountId = body.googleAccountId;
    }

    const updated = await db.site.update({
      where: { id: siteId },
      data: { googleAccountId },
      select: { id: true, googleAccountId: true },
    });
    return Response.json(updated);
  } catch (error) {
    console.error("Site google-account PUT error:", error);
    return Response.json({ error: "Échec de la mise à jour du compte" }, { status: 500 });
  }
}
