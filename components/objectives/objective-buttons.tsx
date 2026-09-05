"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Sparkles, Trash2, Archive, RotateCcw } from "lucide-react";

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

/** One child per channel under this objective, inheriting its goal. */
export function AddChannelsButton({ objectiveId }: { objectiveId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleClick() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/objectives/${objectiveId}/channels`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Échec de la déclinaison");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de la déclinaison");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" variant="outline" onClick={handleClick} disabled={loading} title="Un sous-objectif par canal (Sites, Réponses Google, Wikipédia et IA, Images, Réseaux, Presse), qui hérite des sites et du vocabulaire de cet objectif">
        <Sparkles className="size-3.5" />
        {loading ? "Création…" : "Décliner par canal"}
      </Button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}

/**
 * "Supprimer" archives: nothing is deleted from the database, the whole
 * subtree just leaves every normal view. A second, separate action from
 * the archived list is the only way to actually erase it, precisely so a
 * mis-click here is never the end of the story.
 */
export function DeleteObjectiveButton({
  objectiveId,
  hasChildren,
}: {
  objectiveId: string;
  hasChildren: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleArchive() {
    const message = hasChildren
      ? "Archiver cet objectif et ses sous-objectifs ? Rien n'est supprimé : retrouvez-les dans Objectifs archivés, avec un bouton pour les restaurer."
      : "Archiver cet objectif ? Rien n'est supprimé : retrouvez-le dans Objectifs archivés, avec un bouton pour le restaurer.";
    if (!window.confirm(message)) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/objectives/${objectiveId}/archive`, { method: "POST" });
      if (!res.ok) throw new Error("Échec de l'archivage");
      router.push("/objectives");
      router.refresh();
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  }

  return (
    <Button size="sm" variant="ghost" onClick={handleArchive} disabled={loading} title="Archiver l'objectif (réversible)">
      <Archive className="size-3.5" />
      Archiver
    </Button>
  );
}

export function RestoreObjectiveButton({ objectiveId }: { objectiveId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleRestore() {
    setLoading(true);
    try {
      const res = await fetch(`/api/objectives/${objectiveId}/restore`, { method: "POST" });
      if (!res.ok) throw new Error("Échec de la restauration");
      router.refresh();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button size="sm" variant="outline" onClick={handleRestore} disabled={loading}>
      <RotateCcw className="size-3.5" />
      Restaurer
    </Button>
  );
}

export function PermanentlyDeleteObjectiveButton({
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
      ? "Supprimer définitivement cet objectif, ses sous-objectifs et toutes leurs tâches ? Cette action est irréversible."
      : "Supprimer définitivement cet objectif et ses tâches ? Cette action est irréversible.";
    if (!window.confirm(message)) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/objectives/${objectiveId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Échec de la suppression");
      router.refresh();
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  }

  return (
    <Button size="sm" variant="ghost" onClick={handleDelete} disabled={loading} className="text-danger hover:bg-danger/10" title="Supprimer définitivement">
      <Trash2 className="size-3.5" />
      Supprimer définitivement
    </Button>
  );
}
