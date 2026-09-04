"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Account = { id: string; email: string; isPrimary: boolean };

/** Which linked Google account reads Search Console for this site. */
export function SiteAccountSelect({
  siteId,
  accounts,
  current,
}: {
  siteId: string;
  accounts: Account[];
  current: string | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState(current ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function change(next: string) {
    setValue(next);
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/sites/${siteId}/google-account`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ googleAccountId: next || null }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Échec de la mise à jour");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de la mise à jour");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <select
        value={value}
        onChange={(e) => change(e.target.value)}
        disabled={saving}
        className="h-8 rounded-lg border border-border bg-card px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
      >
        <option value="">Compte de connexion</option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.email}
            {a.isPrimary ? " (connexion)" : ""}
          </option>
        ))}
      </select>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}
