import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { listGSCProperties, ReauthRequiredError } from "@/lib/google";

export async function GET(req: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return Response.json({ error: "Non autorisé" }, { status: 401 });
    }

    // ?account=<linked Google account id> reads that account's properties;
    // without it, the login account's.
    const accountId = new URL(req.url).searchParams.get("account");
    let source: string | { accountId: string } = session.user.id;
    if (accountId) {
      const account = await db.googleAccount.findUnique({
        where: { id: accountId },
        select: { userId: true },
      });
      if (!account || account.userId !== session.user.id) {
        return Response.json({ error: "Compte Google introuvable" }, { status: 404 });
      }
      source = { accountId };
    }

    const properties = await listGSCProperties(source);

    return Response.json(properties);
  } catch (error) {
    if (error instanceof ReauthRequiredError) {
      return Response.json(
        { error: error.message, code: "REAUTH_REQUIRED" },
        { status: 401 }
      );
    }

    console.error("Error listing GSC properties:", error);

    return Response.json(
      {
        error: error instanceof Error ? error.message : "Échec de la récupération des propriétés",
      },
      { status: 500 }
    );
  }
}
