/**
 * Term matching shared by the objective KPI, the action rules and the
 * notoriety checks.
 */

/** Lowercase, strip diacritics and collapse whitespace so "Francoprovençal"
 *  and "francoprovencal" compare equal. */
export function normalizeTerm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function matchesAny(query: string, terms: string[]): boolean {
  if (terms.length === 0) return false;
  const q = normalizeTerm(query);
  return terms.some((t) => {
    const n = normalizeTerm(t);
    return n.length > 0 && q.includes(n);
  });
}

/** Split a user-typed list ("a, b\nc") into clean, deduplicated terms. */
export function parseTerms(input: string | string[] | undefined | null): string[] {
  const raw = Array.isArray(input) ? input : (input ?? "").split(/[,\n;]/);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of raw) {
    const trimmed = t.trim();
    if (!trimmed) continue;
    const key = normalizeTerm(trimmed);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

export type TermBucket = "focus" | "rival" | "other";

/** A query that names a competing term is "rival" even when it also contains
 *  a defended term: "patois savoyard" is the rival vocabulary, not ours. */
export function classifyQuery(
  query: string,
  focusTerms: string[],
  rivalTerms: string[]
): TermBucket {
  if (matchesAny(query, rivalTerms)) return "rival";
  if (matchesAny(query, focusTerms)) return "focus";
  return "other";
}

