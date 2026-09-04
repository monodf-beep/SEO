"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { LinkedAccount } from "@/lib/google/accounts";
import { Button } from "@/components/ui/button";
import { Download, Link2, Trash2 } from "lucide-react";

export function GoogleAccountsSection({
  accounts,
  notice,
  error,
  redirectUri,
}: {
  accounts: LinkedAccount[];
  notice: string | null;
  error: string | null;
  redirectUri: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(notice);
  const [failure, setFailure] = useState<string | null>(error);

  async function unlink(account: LinkedAccount) {
    if (!window.confirm(`Délier ${account.email} ?`)) return;
    setBusy(account.id);
    setFailure(null);
    try {
      const res = await fetch(`/api/google/accounts/${account.id}`, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Échec de la suppression");
      setMessage(`Compte ${account.email} délié.`);
      router.refresh();
    } catch (err) {
      setFailure(err instanceof Error ? err.message : "Échec de la suppression");
    } finally {
      setBusy(null);
    }
  }

  async function importSites(account: LinkedAccount) {
    setBusy(account.id);
    setFailure(null);
    try {
      const res = await fetch(`/api/google/accounts/${account.id}/import`, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as {
        moved?: string[];
        skipped?: string[];
        error?: string;
      };
      if (!res.ok) throw new Error(body.error || "Échec du rapatriement");
      const parts = [`${body.moved?.length ?? 0} site(s) rapatrié(s)`];
      if (body.moved?.length) parts.push(body.moved.join(", "));
      if (body.skipped?.length) parts.push(`déjà présents, laissés en place : ${body.skipped.join(", ")}`);
      setMessage(parts.join(" · "));
      router.refresh();
    } catch (err) {
      setFailure(err instanceof Error ? err.message : "Échec du rapatriement");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      {message && (
        <div className="rounded-lg border border-signal/30 bg-signal-muted px-3 py-2 text-sm text-signal">
          {message}
        </div>
      )}
      {failure && (
        <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {failure}
          {failure.includes("redirect_uri") && redirectUri && (
            <p className="mt-1 text-xs">
              Ajoutez cette URI de redirection dans la Google Cloud Console, identifiant OAuth de
              l&apos;application : <code className="break-all">{redirectUri}</code>
            </p>
          )}
        </div>
      )}

      <div className="panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-heading text-lg font-semibold text-foreground">Comptes liés</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Liez les comptes Google qui possèdent vos propriétés Search Console. Vous choisissez
              ensuite le compte à utiliser pour chaque site.
            </p>
          </div>
          <Button size="sm" render={<a href="/api/google/link" />}>
            <Link2 className="size-3.5" />
            Lier un autre compte Google
          </Button>
        </div>

        <ul className="mt-5 divide-y divide-border/50">
          {accounts.map((a) => (
            <li key={a.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                {a.picture ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.picture} alt="" className="size-9 rounded-full object-cover" />
                ) : (
                  <div className="flex size-9 items-center justify-center rounded-full bg-gradient-to-br from-primary to-blue-400 text-sm font-semibold text-primary-foreground">
                    {a.email.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-medium text-foreground">
                    <span className="truncate">{a.email}</span>
                    {a.isPrimary && (
                      <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-primary/15 text-primary">
                        Connexion
                      </span>
                    )}
                    {!a.hasRefreshToken && (
                      <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-warning/15 text-warning">
                        À relier
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {a.name ? `${a.name} · ` : ""}
                    {a.siteCount} site{a.siteCount > 1 ? "s" : ""} rattaché{a.siteCount > 1 ? "s" : ""}
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {a.importable && a.importable.total > a.importable.conflicts && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => importSites(a)}
                    disabled={busy === a.id}
                    title="Ce compte Google a des sites dans un autre espace CrawlSEO"
                  >
                    <Download className="size-3.5" />
                    Rapatrier {a.importable.total - a.importable.conflicts} site
                    {a.importable.total - a.importable.conflicts > 1 ? "s" : ""}
                  </Button>
                )}
                {!a.isPrimary && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => unlink(a)}
                    disabled={busy === a.id || a.siteCount > 0}
                    title={a.siteCount > 0 ? "Rattachez d'abord ses sites à un autre compte" : "Délier"}
                  >
                    <Trash2 className="size-3.5" />
                    Délier
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>

        {redirectUri && (
          <p className="mt-4 text-xs text-muted-foreground">
            Première liaison : l&apos;URI de redirection{" "}
            <code className="break-all">{redirectUri}</code> doit être déclarée dans la Google Cloud
            Console, à côté de celle de la connexion.
          </p>
        )}
      </div>
    </div>
  );
}
