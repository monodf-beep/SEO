"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Sparkles, Trash2 } from "lucide-react";

/** Creates the objective tree of a template and opens its root. */
export function TemplateButton({
  templateKey,
  label,
  variant = "outline",
}: {
  templateKey: string;
  label: string;
  variant?: "default" | "outline";
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleClick() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/objectives/template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: templateKey }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Échec de la création");
      router.push(`/objectives/${body.rootId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de la création");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" variant={variant} onClick={handleClick} disabled={loading}>
        <Sparkles className="size-3.5" />
        {loading ? "Création…" : label}
      </Button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}

/** One button, a choice of template: creates the tree and opens its root. */
export function TemplatePicker({
  templates,
  variant = "outline",
}: {
  templates: { key: string; label: string; summary: string }[];
  variant?: "default" | "outline";
}) {
  const router = useRouter();
  const [key, setKey] = useState(templates[0]?.key ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const current = templates.find((t) => t.key === key) ?? templates[0];
  if (!current) return null;

  async function handleClick() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/objectives/template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: current!.key }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Échec de la création");
      router.push(`/objectives/${body.rootId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de la création");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1.5">
        <select
          aria-label="Modèle d'objectif"
          className="h-8 rounded-lg border border-border bg-card px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          value={current.key}
          onChange={(e) => setKey(e.target.value)}
        >
          {templates.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </select>
        <Button size="sm" variant={variant} onClick={handleClick} disabled={loading} title={current.summary}>
          <Sparkles className="size-3.5" />
          {loading ? "Création…" : "Créer depuis le modèle"}
        </Button>
      </div>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}

export function DeleteObjectiveButton({
  objectiveId,
  hasChildren,
}: {
  objectiveId: string;
  hasChildren: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    const message = hasChildren
      ? "Supprimer cet objectif, ses sous-objectifs et toutes leurs tâches ?"
      : "Supprimer cet objectif et ses tâches ?";
    if (!window.confirm(message)) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/objectives/${objectiveId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Échec de la suppression");
      router.push("/objectives");
      router.refresh();
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  }

  return (
    <Button size="sm" variant="ghost" onClick={handleDelete} disabled={loading} title="Supprimer l'objectif">
      <Trash2 className="size-3.5" />
      Supprimer
    </Button>
  );
}
