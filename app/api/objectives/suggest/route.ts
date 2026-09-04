import { requireUserId } from "@/lib/objective-api";
import { parseTerms } from "@/lib/objective-terms";
import { suggestNotoriety } from "@/lib/objective-suggest";

/**
 * Suggest the off-site fields of an objective from public sources. Reads
 * only; the form merges what comes back into whatever the user typed.
 */
export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    if (userId instanceof Response) return userId;
    const body = (await req.json().catch(() => ({}))) as {
      siteIds?: unknown;
      focusTerms?: unknown;
      rivalTerms?: unknown;
    };
    const siteIds = Array.isArray(body.siteIds) ? body.siteIds.filter((s): s is string => typeof s === "string") : [];
    const focusTerms = parseTerms(body.focusTerms as string | string[] | undefined).slice(0, 10);
    const rivalTerms = parseTerms(body.rivalTerms as string | string[] | undefined).slice(0, 10);
    const result = await suggestNotoriety({ userId, siteIds, focusTerms, rivalTerms });
    return Response.json(result);
  } catch (error) {
    console.error("Objective suggest error:", error);
    return Response.json({ error: "Échec de la pré-remplissage" }, { status: 500 });
  }
}
