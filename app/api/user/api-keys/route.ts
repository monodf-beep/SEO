import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { encrypt } from "@/lib/encryption";
import { API_PROVIDERS } from "@/lib/api-providers";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Non autorisé" }, { status: 401 });
    }

    const keys = await db.apiKey.findMany({
      where: { userId: session.user.id },
      select: { provider: true, createdAt: true, updatedAt: true },
    });

    const providers: Record<string, { connected: boolean; updatedAt?: string }> =
      Object.fromEntries(API_PROVIDERS.map((p) => [p, { connected: false }]));

    for (const key of keys) {
      providers[key.provider] = {
        connected: true,
        updatedAt: key.updatedAt.toISOString(),
      };
    }

    return Response.json(providers);
  } catch (error) {
    console.error("API keys GET error:", error);
    return Response.json({ error: "Échec du chargement des clés d'API" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Non autorisé" }, { status: 401 });
    }

    const body = (await req.json()) as {
      provider?: string;
      login?: string;
      password?: string;
    };

    if (!body.provider || !body.login || !body.password) {
      return Response.json(
        { error: "Champs obligatoires manquants : provider, login, password" },
        { status: 400 }
      );
    }

    if (!(API_PROVIDERS as readonly string[]).includes(body.provider)) {
      return Response.json({ error: "Fournisseur non pris en charge" }, { status: 400 });
    }

    const saved = await db.apiKey.upsert({
      where: {
        userId_provider: {
          userId: session.user.id,
          provider: body.provider,
        },
      },
      create: {
        userId: session.user.id,
        provider: body.provider,
        encryptedLogin: encrypt(body.login),
        encryptedPassword: encrypt(body.password),
      },
      update: {
        encryptedLogin: encrypt(body.login),
        encryptedPassword: encrypt(body.password),
      },
    });

    return Response.json(
      { provider: saved.provider, connected: true },
      { status: 201 }
    );
  } catch (error) {
    console.error("API keys POST error:", error);
    return Response.json({ error: "Échec de l'enregistrement de la clé d'API" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Non autorisé" }, { status: 401 });
    }

    const body = (await req.json()) as { provider?: string };
    if (!body.provider) {
      return Response.json({ error: "Fournisseur manquant" }, { status: 400 });
    }

    await db.apiKey.delete({
      where: {
        userId_provider: {
          userId: session.user.id,
          provider: body.provider,
        },
      },
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error("API keys DELETE error:", error);
    return Response.json({ error: "Échec de la suppression de la clé d'API" }, { status: 500 });
  }
}
