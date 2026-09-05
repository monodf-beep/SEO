import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { assertPublicDomain } from "@/lib/crawler/engine";
import { syncGSCDataForSite } from "@/lib/workers/gsc-sync";
import { ensureDefaultAlerts } from "@/lib/alerts/evaluate";

export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return Response.json({ error: "Non autorisé" }, { status: 401 });
    }

    const sites = await db.site.findMany({
      where: { userId: session.user.id },
      select: {
        id: true,
        domain: true,
        gscProperty: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            keywords: true,
            crawls: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return Response.json(sites);
  } catch (error) {
    console.error("Error fetching sites:", error);

    return Response.json(
      {
        error: error instanceof Error ? error.message : "Échec de la récupération des sites",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return Response.json({ error: "Non autorisé" }, { status: 401 });
    }

    const { domain, gscProperty, googleAccountId, kind: rawKind } = (await req.json()) as {
      domain: string;
      gscProperty: string;
      googleAccountId?: string | null;
      kind?: string;
    };
    const kind: "WEBSITE" | "PROFILE" = rawKind === "PROFILE" ? "PROFILE" : "WEBSITE";

    if (googleAccountId) {
      const account = await db.googleAccount.findUnique({
        where: { id: googleAccountId },
        select: { userId: true },
      });
      if (!account || account.userId !== session.user.id) {
        return Response.json({ error: "Compte Google introuvable" }, { status: 400 });
      }
    }

    if (!domain || !gscProperty) {
      return Response.json(
        { error: "Domaine ou propriété GSC manquant" },
        { status: 400 }
      );
    }

    if (kind === "PROFILE") {
      // A creator profile is never fetched by CrawlSEO itself, so the SSRF
      // guard does not apply; the property shape is what matters.
      // Whatever prefix Google uses for platform properties, the only thing
      // that has to hold is that there is something to identify it by.
      if (!domain.trim()) {
        return Response.json({ error: "Profil de créateur invalide" }, { status: 400 });
      }
    } else {
      // Reject domains that resolve to private/internal IPs (SSRF protection)
      try {
        await assertPublicDomain(domain);
      } catch {
        return Response.json(
          { error: "Le domaine doit résoudre vers une adresse IP publique" },
          { status: 400 }
        );
      }
    }

    // Check if site already exists
    const existing = await db.site.findUnique({
      where: {
        userId_domain: {
          userId: session.user.id,
          domain,
        },
      },
    });

    if (existing) {
      return Response.json(
        { error: "Ce site existe déjà" },
        { status: 409 }
      );
    }

    // Create the site
    const site = await db.site.create({
      data: {
        userId: session.user.id,
        domain,
        kind,
        gscProperty,
        googleAccountId: googleAccountId || null,
      },
      select: {
        id: true,
        domain: true,
        gscProperty: true,
        createdAt: true,
      },
    });

    await ensureDefaultAlerts(session.user.id, site.id);

    // Kick off initial GSC sync (don't block the response)
    void syncGSCDataForSite(session.user.id, site.id, 28).catch((err) =>
      console.error("Initial GSC sync failed:", err)
    );

    return Response.json(site, { status: 201 });
  } catch (error) {
    console.error("Error creating site:", error);

    return Response.json(
      {
        error: error instanceof Error ? error.message : "Échec de la création du site",
      },
      { status: 500 }
    );
  }
}
