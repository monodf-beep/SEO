/**
 * Every external service a workspace can hold a credential for, in one
 * place: the list was written out twice in the same route file, so adding a
 * provider meant editing both and silently accepting whichever was missed.
 */
export const API_PROVIDERS = [
  "dataforseo",
  "apify",
  "gemini",
  "perplexity",
  "openai",
  "bluesky",
  "reddit",
  "youtube",
] as const;

export type ApiProvider = (typeof API_PROVIDERS)[number];
