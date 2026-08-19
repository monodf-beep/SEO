import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { fetchQuestions, supportedQuestionLanguages } from "@/lib/google/questions";
import { peopleAlsoAsk } from "@/lib/dataforseo/client";

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

    // Google PAA goes through DataForSEO credits, so it is strictly opt-in.
    const includePaa = url.searchParams.get("paa") === "1";

    const [categories, paa] = await Promise.all([
      fetchQuestions(query, lang),
      includePaa ? peopleAlsoAsk(session.user.id, query, lang) : Promise.resolve(null),
    ]);

    return Response.json({ source: "autocomplete", categories, paa });
  } catch (error) {
    console.error("Question research error:", error);
    return Response.json({ error: "Question research failed" }, { status: 500 });
  }
}
