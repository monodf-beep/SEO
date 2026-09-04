import { auth } from "@/lib/auth";
import { listGoogleAccounts } from "@/lib/google/accounts";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Non autorisé" }, { status: 401 });
    }
    return Response.json(await listGoogleAccounts(session.user.id));
  } catch (error) {
    console.error("Google accounts GET error:", error);
    return Response.json({ error: "Échec du chargement des comptes Google" }, { status: 500 });
  }
}
