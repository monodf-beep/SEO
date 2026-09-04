import { auth } from "@/lib/auth";
import { testConnection } from "@/lib/dataforseo/client";
import { testApifyToken } from "@/lib/apify/client";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Non autorisé" }, { status: 401 });
    }

    const body = (await req.json()) as { provider?: string; login?: string; password?: string };
    if (!body.login || !body.password) {
      return Response.json(
        { error: "Identifiant ou mot de passe manquant" },
        { status: 400 }
      );
    }

    const ok =
      body.provider === "apify"
        ? await testApifyToken(body.password)
        : await testConnection(body.login, body.password);
    return Response.json({ success: ok });
  } catch (error) {
    console.error("API key test error:", error);
    return Response.json({ error: "Échec du test de connexion" }, { status: 500 });
  }
}
