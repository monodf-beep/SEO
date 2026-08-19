"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";

type SearchTypeSummary = {
  type: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  topQueries: { query: string; clicks: number; impressions: number; position: number }[];
};

const TYPE_LABELS: Record<string, string> = {
  web: "Web",
  image: "Images",
  video: "Video",
  news: "News",
  discover: "Discover",
};

export function SearchTypesClient({
  siteId,
  hasGsc,
}: {
  siteId: string;
  hasGsc: boolean;
}) {
  const [days, setDays] = useState(28);
  const [loading, setLoading] = useState(hasGsc);
  const [error, setError] = useState<string | null>(null);
  const [breakdown, setBreakdown] = useState<SearchTypeSummary[]>([]);

  const load = useCallback(
    async (period: number) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/sites/${siteId}/search-types?days=${period}`);
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Failed to load search type data");
          setBreakdown([]);
        } else {
          setBreakdown(data.breakdown ?? []);
        }
      } catch {
        setError("Failed to load search type data");
        setBreakdown([]);
      } finally {
        setLoading(false);
      }
    },
    [siteId]
  );

  useEffect(() => {
    if (hasGsc) load(days);
  }, [hasGsc, days, load]);

  if (!hasGsc) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/5 p-4">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
        <p className="text-sm text-muted-foreground">
          Connect Google Search Console to see traffic by search type.
        </p>
      </div>
    );
  }

  const withQueries = breakdown.filter((b) => b.topQueries.length > 0);

  return (
    <div className="space-y-4">
      {/* Period selector */}
      <div className="flex items-center gap-2">
        {[28, 90, 180].map((period) => (
          <button
            key={period}
            type="button"
            onClick={() => setDays(period)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              days === period
                ? "bg-primary text-primary-foreground"
                : "border border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {period} days
          </button>
        ))}
        {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/5 p-4">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      )}

      {/* Breakdown table */}
      {breakdown.length > 0 && (
        <div className="panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-4 py-3 font-medium text-muted-foreground">Surface</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Clicks</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Impressions</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">CTR</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Avg Position</th>
                </tr>
              </thead>
              <tbody>
                {breakdown.map((row) => (
                  <tr
                    key={row.type}
                    className="border-b border-border/50 transition-colors hover:bg-muted/25"
                  >
                    <td className="px-4 py-3 font-medium text-foreground">
                      {TYPE_LABELS[row.type] ?? row.type}
                    </td>
                    <td className="px-4 py-3 text-right font-data text-foreground">
                      {row.clicks.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right font-data text-foreground">
                      {row.impressions.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right font-data text-foreground">
                      {row.impressions > 0 ? `${(row.ctr * 100).toFixed(1)}%` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-data text-foreground">
                      {row.position > 0 ? row.position.toFixed(1) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-border bg-muted/20 px-4 py-2 text-xs text-muted-foreground">
            Discover has no query data — Google only reports pages for that surface
          </div>
        </div>
      )}

      {/* Top queries per non-web surface */}
      {withQueries.map((surface) => (
        <div key={surface.type} className="panel overflow-hidden">
          <div className="border-b border-border bg-muted/30 px-4 py-2 text-sm font-medium text-foreground">
            Top {TYPE_LABELS[surface.type] ?? surface.type} queries
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-4 py-3 font-medium text-muted-foreground">Query</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Clicks</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Impressions</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Position</th>
                </tr>
              </thead>
              <tbody>
                {surface.topQueries.map((q) => (
                  <tr
                    key={q.query}
                    className="border-b border-border/50 transition-colors hover:bg-muted/25"
                  >
                    <td className="max-w-md px-4 py-3 font-medium text-foreground">{q.query}</td>
                    <td className="px-4 py-3 text-right font-data text-foreground">
                      {q.clicks.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right font-data text-foreground">
                      {q.impressions.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right font-data text-foreground">
                      {q.position.toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
