"use client";

import { useState } from "react";
import { CheckCircle2, XCircle, Loader2, FlaskConical, Save, Trash2 } from "lucide-react";

type ApiKeyStatus = Record<string, { connected: boolean; updatedAt?: string }>;

export function ApiKeysSection({
  initialStatus,
}: {
  initialStatus: ApiKeyStatus;
}) {
  const [status, setStatus] = useState<ApiKeyStatus>(initialStatus);
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [testResult, setTestResult] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isConnected = status.dataforseo?.connected ?? false;

  async function handleTest() {
    if (!login || !password) return;
    setTesting(true);
    setTestResult(null);
    setError(null);

    try {
      const res = await fetch("/api/user/api-keys/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login, password }),
      });
      const data = await res.json();
      setTestResult(data.success === true);
      if (!data.success) setError("Identifiants invalides");
    } catch {
      setTestResult(false);
      setError("Échec de la connexion");
    } finally {
      setTesting(false);
    }
  }

  async function handleSave() {
    if (!login || !password) return;
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/user/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "dataforseo", login, password }),
      });

      if (res.ok) {
        setStatus((prev) => ({
          ...prev,
          dataforseo: { connected: true, updatedAt: new Date().toISOString() },
        }));
        setLogin("");
        setPassword("");
        setTestResult(null);
      } else {
        const data = await res.json();
        setError(data.error || "Échec de l'enregistrement");
      }
    } catch {
      setError("Échec de l'enregistrement");
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
        body: JSON.stringify({ provider: "dataforseo" }),
      });

      if (res.ok) {
        setStatus((prev) => ({
          ...prev,
          dataforseo: { connected: false },
        }));
      }
    } catch {
      setError("Échec de la suppression");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="panel p-5">
      <h3 className="font-heading text-lg font-semibold text-foreground">
        Clés d'API externes
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Connectez des API tierces pour des données SEO avancées : volumes de
        mots-clés, analyse de domaine, backlinks.
      </p>

      <div className="mt-5 rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-medium text-foreground">DataForSEO</h4>
            <p className="text-xs text-muted-foreground">
              Recherche de mots-clés, analyse de domaine, backlinks
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isConnected ? (
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
        </div>

        {isConnected ? (
          <div className="mt-4 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Dernière mise à jour :{" "}
              {status.dataforseo.updatedAt
                ? new Date(status.dataforseo.updatedAt).toLocaleDateString("fr-FR")
                : "—"}
            </p>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="flex items-center gap-1.5 rounded-lg border border-danger/30 px-3 py-1.5 text-xs font-medium text-danger transition hover:bg-danger/10 disabled:opacity-50"
            >
              {deleting ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Trash2 className="size-3" />
              )}
              Retirer
            </button>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Login
              </label>
              <input
                type="text"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                placeholder="your@email.com"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Mot de passe
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mot de passe API"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {error && (
              <p className="text-xs text-danger">{error}</p>
            )}

            {testResult === true && (
              <p className="flex items-center gap-1.5 text-xs text-signal">
                <CheckCircle2 className="size-3.5" />
                Connexion réussie
              </p>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleTest}
                disabled={!login || !password || testing}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-muted disabled:opacity-50"
              >
                {testing ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <FlaskConical className="size-3" />
                )}
                Tester la connexion
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!login || !password || saving}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Save className="size-3" />
                )}
                Enregistrer la clé
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
