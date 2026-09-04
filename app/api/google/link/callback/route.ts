import { auth } from "@/lib/auth";
import { appBaseUrl, exchangeCodeForAccount, openLinkState } from "@/lib/google/accounts";

function back(base: string, params: Record<string, string>) {
  const url = new URL(`${base}/settings`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return Response.redirect(url.toString(), 302);
}

export async function GET(req: Request) {
  const base = appBaseUrl(req);
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const denied = url.searchParams.get("error");

  if (denied) return back(base, { error: `Google a refusé la liaison : ${denied}` });
  if (!code || !state) return back(base, { error: "Réponse Google incomplète" });

  const session = await auth();
  const opened = openLinkState(state);
  if (!session?.user?.id || !opened || opened.u !== session.user.id) {
    return back(base, { error: "Liaison expirée ou session différente, recommencez" });
  }

  try {
    const account = await exchangeCodeForAccount(session.user.id, code, base);
    return back(base, { linked: account.email });
  } catch (error) {
    console.error("Google link callback error:", error);
    return back(base, {
      error: error instanceof Error ? error.message : "Échec de la liaison du compte Google",
    });
  }
}
