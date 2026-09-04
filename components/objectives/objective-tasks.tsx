"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ActionStatus, ActionType, ObjectiveAction } from "@prisma/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ACTION_TYPE_LABELS } from "@/lib/objectives";
import { cn } from "@/lib/utils";
import { Check, ExternalLink, Play, Plus, RefreshCw, RotateCcw, Trash2, X } from "lucide-react";

type Site = { id: string; domain: string };

const TYPE_ORDER: ActionType[] = [
  "CONTENT_NEW",
  "CONTENT_UPDATE",
  "TERMINOLOGY",
  "INTERNAL_LINK",
  "BACKLINK",
  "WIKIPEDIA",
  "PRESS",
  "PROFILE",
  "SOCIAL",
  "TECHNICAL",
  "OTHER",
];

const typeTone: Record<ActionType, string> = {
  CONTENT_NEW: "bg-signal-muted text-signal",
  CONTENT_UPDATE: "bg-info/15 text-info",
  TERMINOLOGY: "bg-primary/15 text-primary",
  INTERNAL_LINK: "bg-warning/15 text-warning",
  BACKLINK: "bg-warning/15 text-warning",
  WIKIPEDIA: "bg-muted text-foreground",
  PRESS: "bg-signal-muted text-signal",
  PROFILE: "bg-info/15 text-info",
  SOCIAL: "bg-primary/15 text-primary",
  TECHNICAL: "bg-danger/15 text-danger",
  OTHER: "bg-muted text-muted-foreground",
};

const inputClass =
  "h-9 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40";

export function ObjectiveTasks({
  objectiveId,
  actions,
  sites,
}: {
  objectiveId: string;
  actions: ObjectiveAction[];
  sites: Site[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"todo" | "done">("todo");
  const [typeFilter, setTypeFilter] = useState<ActionType | "ALL">("ALL");
  const [busy, setBusy] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState("");

  const domainOf = useMemo(() => new Map(sites.map((s) => [s.id, s.domain])), [sites]);

  const open = actions.filter((a) => a.status === "TODO" || a.status === "IN_PROGRESS");
  const closed = actions.filter((a) => a.status === "DONE" || a.status === "DISMISSED");
  const shown = (tab === "todo" ? open : closed).filter(
    (a) => typeFilter === "ALL" || a.type === typeFilter
  );
  const typesPresent = TYPE_ORDER.filter((t) => (tab === "todo" ? open : closed).some((a) => a.type === t));

  async function setStatus(action: ObjectiveAction, status: ActionStatus) {
    setBusy(action.id);
    try {
      const res = await fetch(`/api/objectives/${objectiveId}/actions/${action.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Échec de la mise à jour");
      router.refresh();
    } catch (err) {
      console.error(err);
    } finally {
      setBusy(null);
    }
  }

  async function remove(action: ObjectiveAction) {
    if (!window.confirm("Supprimer cette tâche ?")) return;
    setBusy(action.id);
    try {
      await fetch(`/api/objectives/${objectiveId}/actions/${action.id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function sync() {
    setSyncing(true);
    setNotice("");
    try {
      const res = await fetch(`/api/objectives/${objectiveId}/sync`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Échec du recalcul");
      const parts = [
        `${body.created} nouvelle(s)`,
        `${body.updated} mise(s) à jour`,
        `${body.removed} retirée(s)`,
      ];
      if (body.sitesWithoutCrawl?.length) {
        parts.push(`sans crawl, règle terminologie aveugle : ${body.sitesWithoutCrawl.join(", ")}`);
      }
      for (const n of body.notes ?? []) parts.push(n);
      setNotice(parts.join(" · "));
      router.refresh();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Échec du recalcul");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="panel overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-border/60 px-5 pt-4 sm:flex-row sm:items-end sm:justify-between">
        <div role="tablist" aria-label="Tâches" className="flex gap-1">
          <TabButton active={tab === "todo"} onClick={() => setTab("todo")} count={open.length}>
            Tâches à effectuer
          </TabButton>
          <TabButton active={tab === "done"} onClick={() => setTab("done")} count={closed.length}>
            Terminées
          </TabButton>
        </div>
        <div className="flex flex-wrap items-center gap-2 pb-3">
          <ManualTaskDialog objectiveId={objectiveId} sites={sites} />
          <Button size="sm" variant="outline" onClick={sync} disabled={syncing}>
            <RefreshCw className={cn("size-3.5", syncing && "animate-spin")} />
            {syncing ? "Recalcul…" : "Recalculer les tâches"}
          </Button>
        </div>
      </div>

      {notice && (
        <p className="border-b border-border/60 bg-muted/30 px-5 py-2 text-xs text-muted-foreground">
          {notice}
        </p>
      )}

      {typesPresent.length > 1 && (
        <div className="flex flex-wrap gap-1.5 border-b border-border/60 px-5 py-3">
          <FilterChip active={typeFilter === "ALL"} onClick={() => setTypeFilter("ALL")}>
            Tout
          </FilterChip>
          {typesPresent.map((t) => (
            <FilterChip key={t} active={typeFilter === t} onClick={() => setTypeFilter(t)}>
              {ACTION_TYPE_LABELS[t]}
            </FilterChip>
          ))}
        </div>
      )}

      {shown.length === 0 ? (
        <div className="px-5 py-12 text-center">
          <p className="font-medium text-foreground">
            {tab === "todo" ? "Rien à faire pour le moment" : "Aucune tâche terminée"}
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            {tab === "todo"
              ? "Recalculez les tâches après une synchronisation Search Console ou un crawl, ou ajoutez une tâche manuelle."
              : "Les tâches terminées ou ignorées apparaîtront ici."}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border/50">
          {shown.map((a) => (
            <li key={a.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                      typeTone[a.type]
                    )}
                  >
                    {ACTION_TYPE_LABELS[a.type]}
                  </span>
                  {a.status === "IN_PROGRESS" && (
                    <span className="rounded-md bg-info/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-info">
                      En cours
                    </span>
                  )}
                  {a.status === "DISMISSED" && (
                    <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                      Ignorée
                    </span>
                  )}
                  {a.siteId && (
                    <span className="text-[11px] text-muted-foreground">{domainOf.get(a.siteId) ?? a.siteId}</span>
                  )}
                  <span
                    className="ml-auto font-data text-[11px] text-muted-foreground sm:ml-0"
                    title="Priorité (0-100)"
                  >
                    P{a.priority}
                  </span>
                  {a.source === "manual" && (
                    <span className="text-[11px] text-muted-foreground">· manuelle</span>
                  )}
                </div>
                <p className="mt-1.5 font-medium text-foreground">{a.title}</p>
                {a.detail && <p className="mt-0.5 text-sm text-muted-foreground">{a.detail}</p>}
                {a.notes && <p className="mt-1 text-sm italic text-muted-foreground">{a.notes}</p>}
                {a.url && (
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex max-w-full items-center gap-1 truncate text-xs text-primary hover:underline"
                  >
                    <ExternalLink className="size-3 shrink-0" />
                    <span className="truncate">{a.url}</span>
                  </a>
                )}
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-1">
                {a.status === "TODO" && (
                  <IconAction title="Commencer" onClick={() => setStatus(a, "IN_PROGRESS")} disabled={busy === a.id}>
                    <Play className="size-3.5" />
                  </IconAction>
                )}
                {(a.status === "TODO" || a.status === "IN_PROGRESS") && (
                  <>
                    <IconAction title="Marquer terminée" tone="success" onClick={() => setStatus(a, "DONE")} disabled={busy === a.id}>
                      <Check className="size-3.5" />
                    </IconAction>
                    <IconAction title="Ignorer" onClick={() => setStatus(a, "DISMISSED")} disabled={busy === a.id}>
                      <X className="size-3.5" />
                    </IconAction>
                  </>
                )}
                {(a.status === "DONE" || a.status === "DISMISSED") && (
                  <IconAction title="Remettre à faire" onClick={() => setStatus(a, "TODO")} disabled={busy === a.id}>
                    <RotateCcw className="size-3.5" />
                  </IconAction>
                )}
                {a.source === "manual" && (
                  <IconAction title="Supprimer" tone="danger" onClick={() => remove(a)} disabled={busy === a.id}>
                    <Trash2 className="size-3.5" />
                  </IconAction>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TabButton({
  active,
  count,
  onClick,
  children,
}: {
  active: boolean;
  count: number;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "-mb-px flex items-center gap-2 border-b-2 px-3 pb-3 pt-1 text-sm font-medium transition",
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
      <span
        className={cn(
          "rounded-full px-1.5 py-0.5 font-data text-[11px]",
          active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
        )}
      >
        {count}
      </span>
    </button>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-2.5 py-0.5 text-xs transition",
        active
          ? "border-primary bg-primary/15 text-primary"
          : "border-border text-muted-foreground hover:bg-muted"
      )}
    >
      {children}
    </button>
  );
}

function IconAction({
  title,
  tone,
  onClick,
  disabled,
  children,
}: {
  title: string;
  tone?: "success" | "danger";
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded-full p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50",
        tone === "success" && "hover:bg-signal-muted hover:text-signal",
        tone === "danger" && "hover:bg-danger/10 hover:text-danger"
      )}
    >
      {children}
    </button>
  );
}

function ManualTaskDialog({ objectiveId, sites }: { objectiveId: string; sites: Site[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [type, setType] = useState<ActionType>("OTHER");
  const [siteId, setSiteId] = useState("");
  const [url, setUrl] = useState("");
  const [priority, setPriority] = useState("50");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/objectives/${objectiveId}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, detail, type, siteId: siteId || null, url, priority: Number(priority) }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Échec de la création");
      setTitle("");
      setDetail("");
      setUrl("");
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de la création");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <Plus className="size-3.5" />
        Ajouter une tâche
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nouvelle tâche manuelle</DialogTitle>
          <DialogDescription>
            Pour ce que la plateforme ne peut pas détecter seule : une modification Wikipédia, une
            demande de lien, un article à commander.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            className={inputClass}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Proposer « langue savoyarde » comme alias sur Wikidata"
            required
            autoFocus
          />
          <textarea
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            rows={3}
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder="Pourquoi, avec quelles sources, sur quelle page"
          />
          <div className="grid gap-3 sm:grid-cols-3">
            <select className={inputClass} value={type} onChange={(e) => setType(e.target.value as ActionType)}>
              {TYPE_ORDER.map((t) => (
                <option key={t} value={t}>
                  {ACTION_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
            <select className={inputClass} value={siteId} onChange={(e) => setSiteId(e.target.value)}>
              <option value="">Aucun site</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.domain}
                </option>
              ))}
            </select>
            <input
              className={inputClass}
              type="number"
              min={1}
              max={100}
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              title="Priorité de 1 à 100"
            />
          </div>
          <input
            className={inputClass}
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://… (facultatif)"
          />
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" size="sm" disabled={saving || !title.trim()}>
              {saving ? "Enregistrement…" : "Ajouter"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

