import { auth } from "@/lib/auth";
import { importSitesFromAccount } from "@/lib/google/accounts";

/** Brings the sites of the other CrawlSEO user with this Google identity
 *  into the current workspace, with all their data. */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ accountId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Non autorisé" }, { status: 401 });
    }
    const { accountId } = await params;
    const result = await importSitesFromAccount(session.user.id, accountId);
    return Response.json(result);
  } catch (error) {
    console.error("Google account import error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Échec du rapatriement des sites" },
      { status: 500 }
    );
  }
}
