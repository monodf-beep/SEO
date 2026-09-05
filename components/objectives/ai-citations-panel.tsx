"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CitationSummary } from "@/lib/ai-citations";

const LABELS: Record<string, string> = { gemini: "Gemini", perplexity: "Perplexity", openai: "ChatGPT" };
const pct = (x: number) => `${Math.round(x * 100)} %`;

/** "Cité par les IA": share of answers that cite one of the user's sites. */
export function AiCitationsPanel({ objectiveId, summary }: { objectiveId: string; summary: CitationSummary }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState("");
  const [openProvider, setOpenProvider] = useState<string | null>(null);

  async function measure() {
    setRunning(true);
    setNotice("");
    try {
      const res = await fetch(`/api/objectives/${objectiveId}/ai-citations`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Échec de la mesure");
      const n = Array.isArray(body.rows) ? body.rows.length : 0;
      setNotice(`${n} réponse(s) analysée(s).${body.notes?.length ? ` ${body.notes.join(" · ")}` : ""}`);
      router.refresh();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Échec de la mesure");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="panel mb-6 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-heading text-lg font-semibold">Cité par les IA</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Vos termes et les questions réelles posés à Gemini, Perplexity et ChatGPT ; part des réponses qui citent l&apos;un de vos sites. La seule mesure directe du GEO.
          </p>
        </div>
        {summary.configured.length > 0 ? (
          <Button size="sm" variant="outline" onClick={measure} disabled={running}>
            {running ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
            {running ? "Mesure en cours…" : "Mesurer maintenant"}
          </Button>
        ) : (
          <Link href="/settings#api-keys" className="text-sm text-primary underline-offset-4 hover:underline">
            Ajouter une clé Gemini, Perplexity ou OpenAI
          </Link>
        )}
      </div>
      {notice && <p className="mt-2 text-xs text-muted-foreground">{notice}</p>}

      {summary.providers.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          {summary.configured.length > 0
            ? "Aucune mesure encore. Une mesure pose jusqu'à huit questions par moteur, quelques centimes."
            : "Sans clé, pas de mesure : les IA ne se laissent pas observer autrement qu'en les interrogeant."}
        </p>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {summary.providers.map((p) => {
            const delta = p.previousShare === null ? null : Math.round((p.share - p.previousShare) * 100);
            const open = openProvider === p.provider;
            return (
              <div key={p.provider} className="rounded-xl border border-border/60 p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{LABELS[p.provider] ?? p.provider}</p>
                  <p className="text-[11px] text-muted-foreground">{new Date(p.at).toLocaleDateString("fr-FR")}</p>
                </div>
                <p className="mt-1 font-heading text-2xl font-semibold text-foreground">
                  {pct(p.share)}
                  <span className="ml-1 text-sm font-normal text-muted-foreground">
                    ({p.citedOwn}/{p.prompts})
                  </span>
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {delta === null ? "première mesure" : (
                    <span className={cn(delta > 0 && "text-signal", delta < 0 && "text-danger")}>
                      {delta > 0 ? "+" : ""}{delta} pt vs mesure précédente
                    </span>
                  )}
                  {" · "}Wikipédia cité {p.citedWikipedia}/{p.prompts}
                </p>
                <button
                  type="button"
                  onClick={() => setOpenProvider(open ? null : p.provider)}
                  className="mt-2 text-xs text-primary underline-offset-4 hover:underline"
                >
                  {open ? "Masquer le détail" : "Voir les réponses"}
                </button>
                {open && (
                  <ul className="mt-2 space-y-2 text-xs">
                    {p.rows.map((r) => (
                      <li key={r.prompt} className="border-t border-border/40 pt-2">
                        <p className={cn("font-medium", r.citedOwn ? "text-signal" : "text-foreground")}>
                          {r.citedOwn ? "✓ " : "✗ "}{r.prompt}
                        </p>
                        <p className="text-muted-foreground">{r.citations.length ? r.citations.join(", ") : "aucune source citée"}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
