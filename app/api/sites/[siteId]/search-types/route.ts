import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { fetchSearchTypeBreakdown } from "@/lib/google/gsc-client";
import { getDateRange } from "@/lib/date-utils";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ siteId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { siteId } = await params;
    const site = await db.site.findUnique({
      where: { id: siteId },
      select: { userId: true, gscProperty: true },
    });
    if (!site || site.userId !== session.user.id) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    if (!site.gscProperty) {
      return Response.json(
        { error: "Google Search Console is not connected for this site" },
        { status: 400 }
      );
    }

    const url = new URL(req.url);
    const days = Math.min(Math.max(Number(url.searchParams.get("days")) || 28, 1), 365);
    const { start, end } = getDateRange(days);

    const breakdown = await fetchSearchTypeBreakdown(
      session.user.id,
      site.gscProperty,
      start,
      end
    );

    return Response.json({ days, breakdown });
  } catch (error) {
    console.error("Search types error:", error);
    return Response.json({ error: "Search type breakdown failed" }, { status: 500 });
  }
}
