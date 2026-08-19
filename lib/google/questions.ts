/**
 * AnswerThePublic-style question mining built on Google Autocomplete.
 * Fans a seed keyword out across question / preposition / comparison
 * modifiers and groups the suggestions by modifier.
 * Free, no API key needed — server-side only.
 */

import { fetchSuggestions } from "./autocomplete";

export type QuestionCategory = "questions" | "prepositions" | "comparisons";

export type ModifierGroup = {
  modifier: string;
  suggestions: string[];
};

export type QuestionCategoryResult = {
  category: QuestionCategory;
  groups: ModifierGroup[];
};

const MODIFIERS: Record<string, Record<QuestionCategory, string[]>> = {
  en: {
    questions: ["how", "what", "why", "when", "where", "who", "which", "can", "is", "are"],
    prepositions: ["for", "with", "without", "near", "to"],
    comparisons: ["vs", "versus", "or", "like"],
  },
  fr: {
    questions: [
      "comment",
      "pourquoi",
      "quand",
      "où",
      "qui",
      "quel",
      "quelle",
      "combien",
      "est-ce que",
      "peut-on",
    ],
    prepositions: ["pour", "avec", "sans", "contre", "près de"],
    comparisons: ["vs", "ou", "comme"],
  },
};

// Google's suggest endpoint is unauthenticated; keep the fan-out polite.
const CONCURRENCY = 6;

export function supportedQuestionLanguages(): string[] {
  return Object.keys(MODIFIERS);
}

export async function fetchQuestions(
  seed: string,
  language = "en"
): Promise<QuestionCategoryResult[]> {
  const trimmed = seed.trim().toLowerCase();
  if (!trimmed) return [];

  const modifiers = MODIFIERS[language] ?? MODIFIERS.en;
  const jobs = (Object.entries(modifiers) as [QuestionCategory, string[]][]).flatMap(
    ([category, mods]) => mods.map((modifier) => ({ category, modifier }))
  );

  const fetched: { category: QuestionCategory; modifier: string; suggestions: string[] }[] = [];
  for (let i = 0; i < jobs.length; i += CONCURRENCY) {
    const batch = jobs.slice(i, i + CONCURRENCY);
    const settled = await Promise.all(
      batch.map(async (job) => ({
        ...job,
        suggestions: await fetchSuggestions(`${job.modifier} ${trimmed}`, language),
      }))
    );
    fetched.push(...settled);
  }

  // Dedupe across groups and drop bare echoes of "<modifier> <seed>".
  const seen = new Set<string>();
  const grouped = new Map<QuestionCategory, ModifierGroup[]>();
  for (const { category, modifier, suggestions } of fetched) {
    const unique = suggestions.filter((s) => {
      const key = s.toLowerCase();
      if (key === `${modifier} ${trimmed}` || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (unique.length === 0) continue;

    const groups = grouped.get(category) ?? [];
    groups.push({ modifier, suggestions: unique });
    grouped.set(category, groups);
  }

  return Array.from(grouped.entries()).map(([category, groups]) => ({ category, groups }));
}
