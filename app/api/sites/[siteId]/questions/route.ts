import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { fetchQuestions, supportedQuestionLanguages } from "@/lib/google/questions";

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
      select: { userId: true },
    });
    if (!site || site.userId !== session.user.id) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    const url = new URL(req.url);
    const query = url.searchParams.get("q");
    if (!query) {
      return Response.json({ error: "Missing query parameter: q" }, { status: 400 });
    }

    const lang = url.searchParams.get("lang") ?? "en";
    if (!supportedQuestionLanguages().includes(lang)) {
      return Response.json(
        { error: `Unsupported language: ${lang}` },
        { status: 400 }
      );
    }

    const categories = await fetchQuestions(query, lang);
    return Response.json({ source: "autocomplete", categories });
  } catch (error) {
    console.error("Question research error:", error);
    return Response.json({ error: "Question research failed" }, { status: 500 });
  }
}
