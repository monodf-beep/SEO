import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

/** Unlinks a Google account. Refused while sites still read through it. */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ accountId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Non autorisé" }, { status: 401 });
    }
    const { accountId } = await params;
    const account = await db.googleAccount.findUnique({
      where: { id: accountId },
      select: { userId: true, email: true, _count: { select: { sites: true } } },
    });
    if (!account || account.userId !== session.user.id) {
      return Response.json({ error: "Compte Google introuvable" }, { status: 404 });
    }
    if (account.email === session.user.email?.toLowerCase()) {
      return Response.json(
        { error: "Le compte de connexion ne peut pas être délié" },
        { status: 400 }
      );
    }
    if (account._count.sites > 0) {
      return Response.json(
        {
          error: `${account._count.sites} site(s) lisent la Search Console via ce compte. Rattachez-les à un autre compte avant de le délier.`,
        },
        { status: 409 }
      );
    }
    await db.googleAccount.delete({ where: { id: accountId } });
    return Response.json({ success: true });
  } catch (error) {
    console.error("Google account DELETE error:", error);
    return Response.json({ error: "Échec de la suppression du compte" }, { status: 500 });
  }
}
