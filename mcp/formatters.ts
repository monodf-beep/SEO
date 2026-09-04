/**
 * LLM-optimized text formatters for MCP tool responses.
 * Produces compact, readable text tables with aligned columns.
 */

import type { Objective, ObjectiveAction } from "@prisma/client";
import type { ObjectiveKpi, ScopedSite, SyncResult } from "../lib/objectives";

export function formatTable(headers: string[], rows: string[][]): string {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length))
  );

  const pad = (s: string, w: number) => s + " ".repeat(Math.max(0, w - s.length));
  const sep = widths.map((w) => "-".repeat(w)).join(" | ");

  const headerLine = headers.map((h, i) => pad(h, widths[i])).join(" | ");
  const dataLines = rows.map((row) =>
    row.map((cell, i) => pad(cell, widths[i])).join(" | ")
  );

  return [headerLine, sep, ...dataLines].join("\n");
}

function num(n: number): string {
  return n.toLocaleString("en-US");
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function pos(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "-";
  return n.toFixed(1);
}

export function formatSiteOverview(site: any): string {
  const lines: string[] = [];
  lines.push(`Site: ${site.domain}`);
  lines.push(`ID: ${site.id}`);
  if (site.gscProperty) lines.push(`GSC Property: ${site.gscProperty}`);
  lines.push("");

  if (site.metrics) {
    const m = site.metrics;
    lines.push("-- Period Metrics (current vs previous) --");
    lines.push(`Clicks:      ${num(m.current.clicks)} (${m.deltas.clicks > 0 ? "+" : ""}${m.deltas.clicks}%)`);
    lines.push(`Impressions: ${num(m.current.impressions)} (${m.deltas.impressions > 0 ? "+" : ""}${m.deltas.impressions}%)`);
    lines.push(`Avg Position: ${pos(m.current.avgPosition)} (${m.deltas.avgPosition > 0 ? "+" : ""}${m.deltas.avgPosition.toFixed(1)} improvement)`);
    lines.push(`Avg CTR:     ${pct(m.current.avgCtr)} (${m.deltas.avgCtr > 0 ? "+" : ""}${m.deltas.avgCtr}%)`);
    lines.push(`Keywords:    ${num(m.current.uniqueKeywords)}`);
  }

  if (site.latestCrawl) {
    const c = site.latestCrawl;
    lines.push("");
    lines.push("-- Latest Crawl --");
    lines.push(`Status: ${c.status}  |  Health: ${c.healthScore ?? "-"}/100`);
    lines.push(`Pages: ${num(c.pagesFound)}  |  Issues: ${num(c.issuesFound)}`);
    if (c.finishedAt) lines.push(`Finished: ${new Date(c.finishedAt).toISOString().slice(0, 16)}`);
  }

  if (site.latestVitals) {
    const v = site.latestVitals;
    lines.push("");
    lines.push("-- Latest Vitals --");
    lines.push(`Perf Score: ${v.perfScore ?? "-"}/100  |  Device: ${v.device}`);
    if (v.lcp != null) lines.push(`LCP: ${v.lcp.toFixed(2)}s`);
    if (v.cls != null) lines.push(`CLS: ${v.cls.toFixed(3)}`);
    if (v.inp != null) lines.push(`INP: ${v.inp.toFixed(0)}ms`);
    if (v.ttfb != null) lines.push(`TTFB: ${v.ttfb.toFixed(2)}s`);
  }

  return lines.join("\n");
}

export function formatKeywords(keywords: any[]): string {
  if (keywords.length === 0) return "No keywords found.";

  const headers = ["Keyword", "Clicks", "Impressions", "Position", "CTR"];
  const rows = keywords.map((k) => [
    k.query.length > 50 ? k.query.slice(0, 47) + "..." : k.query,
    num(k.clicks),
    num(k.impressions),
    pos(k.position),
    pct(k.ctr),
  ]);

  return `Top ${keywords.length} keywords:\n\n` + formatTable(headers, rows);
}

export function formatPages(pages: any[]): string {
  if (pages.length === 0) return "No pages found.";

  const headers = ["URL", "Clicks", "Impressions", "Position", "CTR"];
  const rows = pages.map((p) => {
    let url = p.url;
    try {
      url = new URL(p.url).pathname;
    } catch {}
    if (url.length > 60) url = url.slice(0, 57) + "...";
    return [url, num(p.clicks), num(p.impressions), pos(p.position), pct(p.ctr)];
  });

  return `Top ${pages.length} pages:\n\n` + formatTable(headers, rows);
}

export function formatTraffic(traffic: any[]): string {
  if (traffic.length === 0) return "No traffic data found.";

  const headers = ["Date", "Clicks", "Impressions"];
  const rows = traffic.map((t) => [t.date, num(t.clicks), num(t.impressions)]);

  const totalClicks = traffic.reduce((s, t) => s + t.clicks, 0);
  const totalImpressions = traffic.reduce((s, t) => s + t.impressions, 0);

  return (
    `Daily traffic (${traffic.length} days):\n` +
    `Total: ${num(totalClicks)} clicks, ${num(totalImpressions)} impressions\n\n` +
    formatTable(headers, rows)
  );
}

export function formatCrawlIssues(issues: any[]): string {
  if (issues.length === 0) return "No crawl issues found.";

  const headers = ["Severity", "Type", "URL", "Message"];
  const rows = issues.map((i) => [
    i.severity,
    i.type,
    i.url.length > 40 ? i.url.slice(0, 37) + "..." : i.url,
    i.message.length > 50 ? i.message.slice(0, 47) + "..." : i.message,
  ]);

  return `${issues.length} crawl issues:\n\n` + formatTable(headers, rows);
}

export function formatVitals(vitals: any[]): string {
  if (vitals.length === 0) return "No vitals reports found.";

  const headers = ["Date", "Device", "Perf", "LCP", "CLS", "INP", "TTFB"];
  const rows = vitals.map((v) => [
    new Date(v.date).toISOString().slice(0, 10),
    v.device,
    v.perfScore != null ? String(v.perfScore) : "-",
    v.lcp != null ? `${v.lcp.toFixed(2)}s` : "-",
    v.cls != null ? v.cls.toFixed(3) : "-",
    v.inp != null ? `${v.inp.toFixed(0)}ms` : "-",
    v.ttfb != null ? `${v.ttfb.toFixed(2)}s` : "-",
  ]);

  return `${vitals.length} vitals reports:\n\n` + formatTable(headers, rows);
}

export function formatOpportunities(opportunities: any): string {
  const lines: string[] = [];
  const s = opportunities.summary;

  lines.push("SEO Opportunities Summary");
  lines.push(`Striking distance: ${s.strikingDistance} | Low CTR: ${s.lowCtr} | Content decay: ${s.contentDecay} | Cannibalization: ${s.cannibalization}`);
  lines.push("");

  if (opportunities.feed && opportunities.feed.length > 0) {
    const headers = ["Type", "Severity", "Title", "Detail"];
    const rows = opportunities.feed.map((o: any) => [
      o.type,
      o.severity,
      (o.title || "").length > 35 ? (o.title || "").slice(0, 32) + "..." : o.title || "",
      (o.detail || "").length > 55 ? (o.detail || "").slice(0, 52) + "..." : o.detail || "",
    ]);
    lines.push(formatTable(headers, rows));
  } else {
    lines.push("No actionable opportunities found.");
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Objectives
// ---------------------------------------------------------------------------

function share(v: number | null | undefined): string {
  return v === null || v === undefined ? "-" : `${(v * 100).toFixed(0)}%`;
}

export type ObjectiveListRow = Objective & {
  kpi: ObjectiveKpi;
  _count?: { children: number; actions: number };
};

export type ObjectiveDetail = Objective & {
  parent: { id: string; title: string } | null;
  scope: ScopedSite[];
  kpi: ObjectiveKpi;
  actions: ObjectiveAction[];
  children: (Objective & { kpi: ObjectiveKpi; todo: number })[];
};

export function formatObjectiveList(objectives: ObjectiveListRow[]): string {
  const byParent = new Map<string | null, ObjectiveListRow[]>();
  for (const o of objectives) {
    const list = byParent.get(o.parentId ?? null) ?? [];
    list.push(o);
    byParent.set(o.parentId ?? null, list);
  }
  const lines: string[] = [`${objectives.length} objective(s):`, ""];
  const walk = (parentId: string | null, depth: number) => {
    for (const o of byParent.get(parentId) ?? []) {
      const indent = "  ".repeat(depth);
      const target = o.targetShare != null ? ` (target ${share(o.targetShare)})` : "";
      const delta =
        o.kpi.shareDeltaPts === null ? "" : ` ${o.kpi.shareDeltaPts > 0 ? "+" : ""}${o.kpi.shareDeltaPts}pt`;
      lines.push(`${indent}${o.title}  (id: ${o.id}) [${o.status}]`);
      lines.push(
        `${indent}  share of demand: ${o.kpi.hasTerms ? share(o.kpi.current.share) : "no terms"}${target}${delta}` +
          `  |  focus impr: ${num(o.kpi.current.focus.impressions)}  |  rival impr: ${num(o.kpi.current.rival.impressions)}` +
          `  |  open tasks: ${o._count?.actions ?? 0}`
      );
      walk(o.id, depth + 1);
    }
  };
  walk(null, 0);
  // Orphans whose parent is not in the list (should not happen, but never hide data)
  for (const o of objectives) {
    if (o.parentId && !objectives.some((p) => p.id === o.parentId)) {
      lines.push(`${o.title}  (id: ${o.id}) [${o.status}] — parent missing`);
    }
  }
  return lines.join("\n");
}

export function formatSyncResult(r: SyncResult): string {
  const lines = [
    `Tasks recomputed: ${r.created} created, ${r.updated} refreshed, ${r.removed} removed (evidence gone), ${r.kept} kept as history.`,
    `Queries in scope: ${r.queriesInScope}.`,
  ];
  if (r.sitesWithoutCrawl?.length) {
    lines.push(`No completed crawl for: ${r.sitesWithoutCrawl.join(", ")} — the terminology rule cannot read those pages. Run a crawl first.`);
  }
  for (const n of r.notes ?? []) lines.push(`Note: ${n}`);
  return lines.join("\n");
}

export function formatObjective(o: ObjectiveDetail): string {
  const lines: string[] = [];
  lines.push(`Objective: ${o.title}`);
  lines.push(`ID: ${o.id}  |  Status: ${o.status}${o.parent ? `  |  Parent: ${o.parent.title} (${o.parent.id})` : ""}`);
  if (o.description) lines.push(o.description);
  lines.push(`Sites: ${o.scope.map((s) => s.domain).join(", ") || "none"}`);
  lines.push(`Focus terms: ${o.focusTerms.join(", ") || "-"}`);
  lines.push(`Rival terms: ${o.rivalTerms.join(", ") || "-"}`);
  if (o.targetShare != null) lines.push(`Target share: ${share(o.targetShare)}${o.deadline ? ` by ${new Date(o.deadline).toISOString().slice(0, 10)}` : ""}`);
  lines.push("");

  const k = o.kpi;
  if (!k.hasTerms) {
    lines.push("KPI: no terms defined, share of demand unavailable.");
  } else {
    lines.push(`KPI (last ${k.windowDays} days vs previous ${k.windowDays})`);
    lines.push(
      `Share of demand: ${share(k.current.share)} (prev ${share(k.previous.share)}${k.shareDeltaPts === null ? "" : `, ${k.shareDeltaPts > 0 ? "+" : ""}${k.shareDeltaPts}pt`})`
    );
    lines.push(
      `Focus: ${num(k.current.focus.impressions)} impr, ${num(k.current.focus.clicks)} clicks, ${k.current.focus.queries} queries, avg pos ${pos(k.current.focus.avgPosition)}`
    );
    lines.push(
      `Rival: ${num(k.current.rival.impressions)} impr, ${num(k.current.rival.clicks)} clicks, ${k.current.rival.queries} queries, avg pos ${pos(k.current.rival.avgPosition)}`
    );
    lines.push(`History: ${k.series.map((p) => `${p.end.slice(5)}=${share(p.share)}`).join("  ")}`);
    lines.push("");
    if (k.topFocus.length) {
      lines.push("Top focus queries:");
      lines.push(
        formatTable(
          ["Query", "Site", "Pos", "Impr", "Clicks"],
          k.topFocus.map((r) => [r.query, r.domain, pos(r.position), num(r.impressions), num(r.clicks)])
        )
      );
      lines.push("");
    }
    if (k.topRival.length) {
      lines.push("Top rival queries (where the focus term should be installed):");
      lines.push(
        formatTable(
          ["Query", "Site", "Pos", "Impr", "Page"],
          k.topRival.map((r) => [r.query, r.domain, pos(r.position), num(r.impressions), r.page ?? "-"])
        )
      );
      lines.push("");
    }
  }

  if (o.children?.length) {
    lines.push("Sub-objectives:");
    for (const c of o.children) {
      lines.push(`  ${c.title}  (id: ${c.id})  share ${c.kpi.hasTerms ? share(c.kpi.current.share) : "-"}  |  open tasks: ${c.todo}`);
    }
    lines.push("");
  }

  lines.push(`Tasks (${o.actions.length}):`);
  if (o.actions.length === 0) {
    lines.push("  none");
  } else {
    for (const a of o.actions) {
      lines.push(`  [${a.status}] P${a.priority} ${a.type} — ${a.title}  (id: ${a.id})`);
      if (a.detail) lines.push(`      ${a.detail}`);
      if (a.url) lines.push(`      ${a.url}`);
      if (a.notes) lines.push(`      notes: ${a.notes}`);
    }
  }
  return lines.join("\n");
}
