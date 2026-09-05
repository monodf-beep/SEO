/**
 * Conversations to join: recent public posts and videos about the
 * objective's vocabulary, on networks with an open read API.
 *
 * - YouTube through the official Data API
 * - Bluesky through bsky.social, signed in with an app password
 * - Reddit through oauth.reddit.com, with a script app's client credentials
 *
 * The public read paths of Reddit and Bluesky answer 403 to a datacenter
 * IP whatever the User-Agent — measured with a browser User-Agent, refused
 * identically — so all three now go through a credential the user holds.
 * Each is free and needs no card; a missing one is reported as a note with
 * the place to get it, never retried in a loop.
 *
 * Facebook, Instagram, LinkedIn, TikTok and X expose nothing readable
 * without a login and forbid automated reading. They are reached only
 * through Apify's scrapers, on the user's own Apify account, when a token is
 * configured: the scraping and its risk sit with Apify, not with the
 * user's social accounts.
 */

import { getApifyToken, runActorItems } from "@/lib/apify/client";
import {
  BLUESKY_HOST,
  REDDIT_API_HOST,
  blueskyToken,
  redditToken,
  youtubeKey,
} from "@/lib/social-keys";
import { matchesAny, normalizeTerm } from "@/lib/objective-terms";
import type { GeneratedAction } from "@/lib/objectives";

const TIMEOUT_MS = 8000;
const USER_AGENT = "CrawlSEO/1.0 (objective conversation checks; read-only)";

export type ConversationInput = {
  userId: string;
  focusTerms: string[];
  rivalTerms: string[];
  entityName: string | null;
  socialProfiles: string[];
};

export type ConversationReport = { actions: GeneratedAction[]; notes: string[] };

const quote = (s: string) => `« ${s} »`;

/** Past this, a post is dead: no feed resurfaces it, and a comment there
 *  reaches nobody. Applied everywhere a "join this conversation" action is
 *  built, so a search result sorted by relevance rather than recency (some
 *  Apify actors) can't slip a years-old post past the age check. */
const MAX_AGE_DAYS = 60;

function daysAgo(iso: string): number {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? Math.max(0, Math.round((Date.now() - t) / 86_400_000)) : 999;
}

/** Missing or unparseable dates count as stale: better to skip a post than
 *  suggest commenting on one we can't actually vouch for the age of. */
function isFreshEnough(iso: string | null | undefined): iso is string {
  return iso != null && daysAgo(iso) <= MAX_AGE_DAYS;
}

async function getJson(
  url: string,
  notes: string[],
  label: string,
  headers: Record<string, string> = {},
  /** Turns a status into a note that says what to do about it. Without it a
   *  bare code is reported, which tells the user nothing actionable. */
  explain?: (status: number) => string | null
) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json", ...headers },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      notes.push(explain?.(res.status) ?? `${label} : réponse ${res.status}, recherche sautée`);
      return null;
    }
    return (await res.json()) as Record<string, unknown>;
  } catch {
    notes.push(`${label} injoignable, recherche sautée`);
    return null;
  }
}

/** The terms worth searching: the term being imposed and the main rival. */
function searchTerms(input: ConversationInput): string[] {
  const out: string[] = [];
  if (input.focusTerms[0]) out.push(input.focusTerms[0]);
  if (input.rivalTerms[0]) out.push(input.rivalTerms[0]);
  return out;
}

// ---------------------------------------------------------------------------
// YouTube
// ---------------------------------------------------------------------------

type YtSearchItem = {
  id?: { videoId?: string; channelId?: string };
  snippet?: { title?: string; channelTitle?: string; channelId?: string; publishedAt?: string; description?: string };
};

async function youtubeRules(input: ConversationInput, notes: string[]): Promise<GeneratedAction[]> {
  const key = await youtubeKey(input.userId);
  const actions: GeneratedAction[] = [];
  if (!key) {
    notes.push(
      "Clé YouTube absente : les vidéos récentes sur le sujet et votre chaîne n'ont pas été lues — Paramètres du compte, Services externes"
    );
    return actions;
  }
  const focusLabel = input.focusTerms[0] ?? null;
  const since = new Date(Date.now() - MAX_AGE_DAYS * 86_400_000).toISOString();

  // Recent videos about the vocabulary, to comment on.
  for (const term of searchTerms(input)) {
    const url =
      `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&order=date&maxResults=5` +
      `&relevanceLanguage=fr&publishedAfter=${encodeURIComponent(since)}&q=${encodeURIComponent(`"${term}"`)}&key=${key}`;
    const data = await getJson(url, notes, `YouTube (${term})`);
    const items = ((data as { items?: YtSearchItem[] } | null)?.items ?? []).filter((i) => i.id?.videoId);
    for (const it of items.slice(0, 3)) {
      const title = it.snippet?.title ?? "";
      const own = input.socialProfiles.some((p) => it.snippet?.channelId && p.includes(it.snippet.channelId));
      if (own) continue;
      const namesFocus = focusLabel ? matchesAny(`${title} ${it.snippet?.description ?? ""}`, [focusLabel]) : false;
      actions.push({
        fingerprint: `conv:yt:${it.id?.videoId}`,
        type: "SOCIAL",
        title: `Commenter la vidéo ${quote(title)} (${it.snippet?.channelTitle ?? "YouTube"})`,
        detail:
          `Publiée il y a ${daysAgo(it.snippet?.publishedAt ?? "")} jours, trouvée sur ${quote(term)}. ` +
          (namesFocus
            ? `Elle nomme déjà ${quote(focusLabel ?? "")} : un commentaire qui apporte une précision et un lien vers votre page renforce l'association.`
            : focusLabel
              ? `Elle ne nomme pas ${quote(focusLabel)} : un commentaire utile qui l'emploie naturellement, sans lien promotionnel dans les premières lignes, fait entrer le terme dans la conversation.`
              : `Un commentaire utile fait exister votre expertise là où le sujet est discuté.`),
        url: `https://www.youtube.com/watch?v=${it.id?.videoId}`,
        priority: 45,
        source: "rule:conversation_youtube",
      });
    }
  }

  // The user's own channel: do the recent video titles carry the term?
  const channelUrl = input.socialProfiles.find((p) => /youtube\.com\//.test(p));
  if (channelUrl && focusLabel) {
    const handle = channelUrl.match(/youtube\.com\/@([^/?#]+)/)?.[1];
    const idMatch = channelUrl.match(/youtube\.com\/channel\/([^/?#]+)/)?.[1];
    const chanUrl = handle
      ? `https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails&forHandle=${encodeURIComponent(handle)}&key=${key}`
      : idMatch
        ? `https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails&id=${encodeURIComponent(idMatch)}&key=${key}`
        : null;
    if (chanUrl) {
      const chan = await getJson(chanUrl, notes, "YouTube (chaîne)");
      const c = (chan as { items?: Array<{ id?: string; snippet?: { title?: string; description?: string }; contentDetails?: { relatedPlaylists?: { uploads?: string } } }> } | null)?.items?.[0];
      if (c) {
        const text = `${c.snippet?.title ?? ""} ${c.snippet?.description ?? ""}`;
        const wanted = [focusLabel, input.entityName].filter((x): x is string => Boolean(x));
        const missing = wanted.filter((w) => !matchesAny(text, [w]));
        if (missing.length > 0) {
          actions.push({
            fingerprint: `yt:channel:${c.id}`,
            type: "PROFILE",
            title: `Nommer ${missing.map(quote).join(" et ")} dans la description de la chaîne YouTube`,
            detail: `Chaîne ${quote(c.snippet?.title ?? "")}. La description de la chaîne est indexée par Google sur la requête marque : elle doit porter le même vocabulaire que le site.`,
            url: channelUrl,
            priority: 50,
            source: "rule:youtube_channel",
          });
        }
        const uploads = c.contentDetails?.relatedPlaylists?.uploads;
        if (uploads) {
          const vids = await getJson(
            `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=10&playlistId=${encodeURIComponent(uploads)}&key=${key}`,
            notes,
            "YouTube (vidéos de la chaîne)"
          );
          const items = (vids as { items?: Array<{ snippet?: { title?: string } }> } | null)?.items ?? [];
          if (items.length > 0) {
            const naming = items.filter((v) => matchesAny(v.snippet?.title ?? "", [focusLabel])).length;
            if (naming < Math.ceil(items.length / 2)) {
              actions.push({
                fingerprint: `yt:titles:${c.id}`,
                type: "SOCIAL",
                title: `Mettre ${quote(focusLabel)} dans les titres de vos vidéos (${naming}/${items.length} récentes le font)`,
                detail: `Les titres de vidéos sont ce que YouTube et Google indexent d'abord. Renommer les vidéos existantes est sans risque et immédiat ; pour les prochaines, la requête visée en début de titre.`,
                url: channelUrl,
                priority: 55,
                source: "rule:youtube_titles",
              });
            }
          }
        }
      }
    }
  }
  return actions;
}

// ---------------------------------------------------------------------------
// Bluesky
// ---------------------------------------------------------------------------

type BskyPost = {
  uri?: string;
  author?: { handle?: string; displayName?: string };
  record?: { text?: string; createdAt?: string };
  likeCount?: number;
};

async function blueskyRules(input: ConversationInput, notes: string[]): Promise<GeneratedAction[]> {
  const actions: GeneratedAction[] = [];
  const token = await blueskyToken(input.userId);
  if (!token) {
    notes.push(
      "Bluesky non connecté : la recherche publique refuse les IP de serveur, un mot de passe d'application suffit — Paramètres du compte, Services externes"
    );
    return actions;
  }
  const auth = { Authorization: `Bearer ${token}` };
  const focusLabel = input.focusTerms[0] ?? null;
  for (const term of searchTerms(input)) {
    const url = `${BLUESKY_HOST}/xrpc/app.bsky.feed.searchPosts?q=${encodeURIComponent(`"${term}"`)}&sort=latest&limit=5`;
    const data = await getJson(url, notes, `Bluesky (${term})`, auth, (status) =>
      status === 400 || status === 401
        ? "Bluesky a refusé la session : le mot de passe d'application a peut-être été révoqué, à refaire dans Paramètres du compte"
        : `Bluesky (${term}) : réponse ${status}, recherche sautée`
    );
    const posts = ((data as { posts?: BskyPost[] } | null)?.posts ?? [])
      .filter((p) => isFreshEnough(p.record?.createdAt))
      .sort((a, b) => Date.parse(b.record!.createdAt!) - Date.parse(a.record!.createdAt!));
    for (const p of posts.slice(0, 3)) {
      if (!p.uri || !p.author?.handle) continue;
      const rkey = p.uri.split("/").pop();
      const text = p.record?.text ?? "";
      const own = input.socialProfiles.some((s) => s.includes(p.author?.handle ?? " "));
      if (own) continue;
      actions.push({
        fingerprint: `conv:bsky:${rkey}`,
        type: "SOCIAL",
        title: `Répondre au post de @${p.author.handle} sur ${quote(term)}`,
        detail:
          `Il y a ${daysAgo(p.record!.createdAt!)} jours : « ${text.slice(0, 140)}${text.length > 140 ? "…" : ""} ». ` +
          (focusLabel && !matchesAny(text, [focusLabel])
            ? `Le post ne nomme pas ${quote(focusLabel)} : une réponse qui l'emploie, avec une précision utile, fait entrer le terme dans la conversation.`
            : `Une réponse utile depuis votre compte associe l'entité au sujet.`),
        url: `https://bsky.app/profile/${p.author.handle}/post/${rkey}`,
        priority: 35,
        source: "rule:conversation_bluesky",
      });
    }
  }
  return actions;
}

// ---------------------------------------------------------------------------
// Reddit
// ---------------------------------------------------------------------------

type RedditChild = { data?: { id?: string; title?: string; subreddit?: string; permalink?: string; created_utc?: number; num_comments?: number } };

async function redditRules(input: ConversationInput, notes: string[]): Promise<GeneratedAction[]> {
  const actions: GeneratedAction[] = [];
  const token = await redditToken(input.userId);
  if (!token) {
    notes.push(
      "Reddit non connecté : la recherche publique refuse les IP de serveur, une application « script » suffit — Paramètres du compte, Services externes"
    );
    return actions;
  }
  const auth = { Authorization: `Bearer ${token}` };
  const focusLabel = input.focusTerms[0] ?? null;
  for (const term of searchTerms(input)) {
    const url = `${REDDIT_API_HOST}/search?q=${encodeURIComponent(`"${term}"`)}&sort=new&t=month&limit=5`;
    // Reddit serves a "Blocked" page from oauth.reddit.com to some server
    // IPs even with a valid token — measured, and indistinguishable from an
    // auth failure by status alone. Saying so is the only way the user knows
    // that fixing the credentials will not help.
    const data = await getJson(url, notes, `Reddit (${term})`, auth, (status) =>
      status === 403
        ? "Reddit refuse l'IP de ce serveur même authentifié : rien à corriger dans vos identifiants, seul un changement d'hébergement ou un relais y changerait quelque chose"
        : status === 401
          ? "Reddit a refusé les identifiants : vérifiez le client ID et le secret dans Paramètres du compte"
          : `Reddit (${term}) : réponse ${status}, recherche sautée`
    );
    const children = ((data as { data?: { children?: RedditChild[] } } | null)?.data?.children ?? [])
      .filter((c) => c.data?.id && c.data.created_utc && isFreshEnough(new Date(c.data.created_utc * 1000).toISOString()))
      .sort((a, b) => (b.data!.created_utc ?? 0) - (a.data!.created_utc ?? 0));
    for (const c of children.slice(0, 3)) {
      const d = c.data!;
      const age = daysAgo(new Date(d.created_utc! * 1000).toISOString());
      actions.push({
        fingerprint: `conv:reddit:${d.id}`,
        type: "SOCIAL",
        title: `Répondre dans r/${d.subreddit ?? "reddit"} : ${quote(d.title ?? "")}`,
        detail:
          `Il y a ${age} jours, ${d.num_comments ?? 0} commentaires. ` +
          (focusLabel && !matchesAny(d.title ?? "", [focusLabel])
            ? `Le fil ne nomme pas ${quote(focusLabel)} : une réponse documentée qui l'emploie, sans lien promotionnel, est ce que Reddit tolère et ce que Google remonte dans « Discussions et forums ».`
            : `Une réponse documentée depuis votre compte, sans lien promotionnel.`),
        url: d.permalink ? `https://www.reddit.com${d.permalink}` : undefined,
        priority: 40,
        source: "rule:conversation_reddit",
      });
    }
  }
  return actions;
}

// ---------------------------------------------------------------------------
// Apify: Instagram, Facebook, LinkedIn, TikTok, X
// ---------------------------------------------------------------------------

type Post = { url: string; text: string; author: string; date: string | null; likes: number | null };

type Network = {
  key: string;
  label: string;
  actor: string;
  input: (term: string) => Record<string, unknown>;
  map: (item: Record<string, unknown>) => Post | null;
};

const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const obj = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const hashtag = (term: string) => normalizeTerm(term).replace(/[^a-z0-9]/g, "");
const isoOf = (v: unknown) => {
  if (typeof v === "number") return new Date(v < 1e12 ? v * 1000 : v).toISOString();
  if (typeof v === "string" && v) return v;
  return null;
};

const NETWORKS: Network[] = [
  {
    key: "instagram",
    label: "Instagram",
    actor: "apify/instagram-hashtag-scraper",
    input: (term) => ({ hashtags: [hashtag(term)], resultsType: "posts", resultsLimit: 10 }),
    map: (i) => ({ url: str(i.url), text: str(i.caption), author: str(i.ownerUsername), date: isoOf(i.timestamp), likes: num(i.likesCount) }),
  },
  {
    key: "facebook",
    label: "Facebook",
    actor: "scraper_one/facebook-posts-search",
    input: (term) => ({ query: term, resultsCount: 10, searchType: "latest" }),
    map: (i) => ({ url: str(i.url), text: str(i.postText), author: str(obj(i.author).name), date: isoOf(i.timestamp), likes: num(i.reactionsCount) }),
  },
  {
    key: "linkedin",
    label: "LinkedIn",
    actor: "harvestapi/linkedin-post-search",
    input: (term) => ({ searchQueries: [term], maxPosts: 10, sortBy: "date" }),
    map: (i) => ({
      url: str(i.linkedinUrl),
      text: str(i.content),
      author: str(obj(i.author).name),
      date: isoOf(obj(i.postedAt).timestamp ?? obj(i.postedAt).date),
      likes: num(obj(i.engagement).likes),
    }),
  },
  {
    key: "tiktok",
    label: "TikTok",
    actor: "clockworks/tiktok-scraper",
    input: (term) => ({ searchQueries: [term], resultsPerPage: 10, searchSection: "/video" }),
    map: (i) => ({ url: str(i.webVideoUrl), text: str(i.text), author: str(obj(i.authorMeta).name), date: isoOf(i.createTimeISO), likes: num(i.diggCount) }),
  },
  {
    key: "x",
    label: "X",
    actor: "apidojo/tweet-scraper",
    input: (term) => ({ searchTerms: [term], maxItems: 10, sort: "Latest" }),
    map: (i) => ({ url: str(i.url), text: str(i.text), author: str(obj(i.author).userName), date: isoOf(i.createdAt), likes: num(i.likeCount) }),
  },
];

/** APIFY_NETWORKS limits the networks searched, e.g. "instagram,facebook". */
function enabledNetworks(): Network[] {
  const wanted = (process.env.APIFY_NETWORKS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return wanted.length ? NETWORKS.filter((n) => wanted.includes(n.key)) : NETWORKS;
}

async function apifyRules(input: ConversationInput, notes: string[]): Promise<GeneratedAction[]> {
  const actions: GeneratedAction[] = [];
  const token = await getApifyToken(input.userId);
  if (!token) {
    notes.push("Apify non configuré : Instagram, Facebook, LinkedIn, TikTok et X n'ont pas été lus");
    return actions;
  }
  const focusLabel = input.focusTerms[0] ?? null;
  const term = focusLabel ?? input.rivalTerms[0];
  if (!term) return actions;

  await Promise.all(
    enabledNetworks().map(async (net) => {
      let items: Record<string, unknown>[];
      try {
        items = await runActorItems(token, net.actor, net.input(term), { timeoutSecs: 90, maxItems: 10 });
      } catch (err) {
        notes.push(`Apify ${net.label} : ${err instanceof Error ? err.message.slice(0, 120) : "échec"}`);
        return;
      }
      const posts = items
        .map((raw) => net.map(raw))
        .filter((p): p is Post & { date: string } => p !== null && Boolean(p.url) && isFreshEnough(p.date))
        .sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
      let n = 0;
      for (const p of posts) {
        const own = input.socialProfiles.some((s) => p.author && s.toLowerCase().includes(p.author.toLowerCase()));
        if (own) continue;
        const id = p.url.replace(/[?#].*$/, "").split("/").filter(Boolean).slice(-2).join("-");
        actions.push({
          fingerprint: `conv:${net.key}:${id}`,
          type: "SOCIAL",
          title: `Commenter le post de ${p.author ? `@${p.author}` : "quelqu'un"} sur ${net.label} (${quote(term)})`,
          detail:
            `Il y a ${daysAgo(p.date)} jours` +
            (p.likes !== null ? `, ${p.likes} réactions` : "") +
            ` : « ${p.text.slice(0, 140)}${p.text.length > 140 ? "…" : ""} ». ` +
            (focusLabel && !matchesAny(p.text, [focusLabel])
              ? `Le post ne nomme pas ${quote(focusLabel)} : un commentaire utile qui l'emploie, sans lien promotionnel, fait entrer le terme dans la conversation.`
              : `Un commentaire utile depuis votre compte associe l'entité au sujet.`),
          url: p.url,
          priority: 38,
          source: `rule:conversation_${net.key}`,
        });
        if (++n >= 3) break;
      }
    })
  );
  return actions;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function generateConversationActions(input: ConversationInput): Promise<ConversationReport> {
  const notes: string[] = [];
  if (searchTerms(input).length === 0) return { actions: [], notes };
  const [yt, bsky, reddit, apify] = await Promise.all([
    youtubeRules(input, notes),
    blueskyRules(input, notes),
    redditRules(input, notes),
    apifyRules(input, notes),
  ]);
  // Dedupe on the normalized title in case two networks surface the same thing.
  const seen = new Set<string>();
  const actions = [...yt, ...bsky, ...reddit, ...apify].filter((a) => {
    const k = normalizeTerm(a.title);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return { actions, notes };
}
