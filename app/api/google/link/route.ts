import { auth } from "@/lib/auth";
import { appBaseUrl, buildLinkUrl } from "@/lib/google/accounts";

/** Starts the OAuth dance that links another Google account to this user. */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.redirect(`${appBaseUrl(req)}/login`, 302);
  }
  return Response.redirect(buildLinkUrl(appBaseUrl(req), session.user.id), 302);
}
