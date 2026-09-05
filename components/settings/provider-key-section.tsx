"use client";

import { useState } from "react";
import { CheckCircle2, XCircle, Loader2, FlaskConical, Save, Trash2 } from "lucide-react";

type Status = { connected: boolean; updatedAt?: string };

/** One secret for one external service, stored like the other API keys. */
export function ProviderKeySection({
  provider,
  title,
  description,
  label,
  placeholder,
  loginLabel,
  loginPlaceholder,
  hint,
  initialStatus,
}: {
  provider: string;
  title: string;
  description: string;
  label: string;
  placeholder: string;
  /** Set for a service that needs an identifier as well as a secret (a
   *  Bluesky handle, a Reddit client id). Left unset, the stored login is
   *  the placeholder "token" the single-secret services use. */
  loginLabel?: string;
  loginPlaceholder?: string;
  hint?: string;
  initialStatus: Status;
}) {
  const [status, setStatus] = useState<Status>(initialStatus);
  const [token, setToken] = useState("");
  const [login, setLogin] = useState("");
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [testResult, setTestResult] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ready = Boolean(token) && (!loginLabel || Boolean(login));
  const sentLogin = loginLabel ? login : "token";

  async function handleTest() {
    if (!ready) return;
    setTesting(true);
    setTestResult(null);
    setError(null);
    try {
      const res = await fetch("/api/user/api-keys/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, login: sentLogin, password: token }),
      });
      const data = await res.json();
      setTestResult(Boolean(data.success));
      if (!data.success) setError(`Clé refusée par ${title}`);
    } catch {
      setTestResult(false);
      setError("Échec du test");
    } finally {
      setTesting(false);
    }
  }

  async function handleSave() {
    if (!ready) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/user/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, login: sentLogin, password: token }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Échec de l'enregistrement");
      }
      setStatus({ connected: true, updatedAt: new Date().toISOString() });
      setToken("");
      setLogin("");
      setTestResult(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de l'enregistrement");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch("/api/user/api-keys", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      if (res.ok) setStatus({ connected: false });
    } catch {
      setError("Échec de la suppression");
    } finally {
      setDeleting(false);
    }
  }

  const input =
    "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";

  return (
    <div className="mt-4 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-medium text-foreground">{title}</h4>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        {status.connected ? (
          <span className="flex items-center gap-1.5 rounded-full bg-signal/10 px-2.5 py-1 text-xs font-medium text-signal">
            <CheckCircle2 className="size-3.5" />
            Connecté
          </span>
        ) : (
          <span className="flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
            <XCircle className="size-3.5" />
            Non configuré
          </span>
        )}
      </div>

      {status.connected ? (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Dernière mise à jour :{" "}
            {status.updatedAt ? new Date(status.updatedAt).toLocaleDateString("fr-FR") : "—"}
          </p>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="flex items-center gap-1.5 rounded-lg border border-danger/30 px-3 py-1.5 text-xs font-medium text-danger transition hover:bg-danger/10 disabled:opacity-50"
          >
            {deleting ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
            Retirer
          </button>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {loginLabel && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">{loginLabel}</label>
              <input type="text" value={login} onChange={(e) => setLogin(e.target.value)} placeholder={loginPlaceholder} className={input} />
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
            <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder={placeholder} className={input} />
          </div>
          {error && <p className="text-xs text-danger">{error}</p>}
          {testResult === true && (
            <p className="flex items-center gap-1.5 text-xs text-signal">
              <CheckCircle2 className="size-3.5" />
              Clé valide
            </p>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleTest}
              disabled={!ready || testing}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-muted disabled:opacity-50"
            >
              {testing ? <Loader2 className="size-3 animate-spin" /> : <FlaskConical className="size-3" />}
              Tester la clé
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!ready || saving}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? <Loader2 className="size-3 animate-spin" /> : <Save className="size-3" />}
              Enregistrer la clé
            </button>
          </div>
          {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
        </div>
      )}
    </div>
  );
}
