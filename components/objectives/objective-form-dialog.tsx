"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Pencil, Plus } from "lucide-react";

export type ObjectiveFormValues = {
  id?: string;
  title: string;
  description: string;
  parentId: string;
  siteIds: string[];
  focusTerms: string;
  rivalTerms: string;
  targetShare: string;
  deadline: string;
  status: "ACTIVE" | "PAUSED" | "DONE";
  entityName: string;
  wikiArticles: string;
  mediaBlogs: string;
  guestSites: string;
  socialProfiles: string;
  directories: string;
  rivalSites: string;
};

const inputClass =
  "h-9 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40";
const textareaClass =
  "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40";

export function ObjectiveFormDialog({
  mode,
  sites,
  parents,
  initial,
  triggerLabel,
  triggerVariant = "default",
  triggerSize = "sm",
}: {
  mode: "create" | "edit";
  sites: { id: string; domain: string }[];
  /** objectives that can be chosen as parent */
  parents: { id: string; title: string }[];
  initial?: Partial<ObjectiveFormValues>;
  triggerLabel?: string;
  triggerVariant?: "default" | "outline" | "ghost" | "secondary";
  triggerSize?: "sm" | "default" | "xs";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [values, setValues] = useState<ObjectiveFormValues>({
    title: "",
    description: "",
    parentId: "",
    siteIds: [],
    focusTerms: "",
    rivalTerms: "",
    targetShare: "",
    deadline: "",
    status: "ACTIVE",
    entityName: "",
    wikiArticles: "",
    mediaBlogs: "",
    guestSites: "",
    socialProfiles: "",
    directories: "",
    rivalSites: "",
    ...initial,
  });
  const [showNotoriety, setShowNotoriety] = useState(
    Boolean(
      initial?.entityName ||
        initial?.wikiArticles ||
        initial?.mediaBlogs ||
        initial?.guestSites ||
        initial?.socialProfiles ||
        initial?.directories ||
        initial?.rivalSites
    )
  );

  function set<K extends keyof ObjectiveFormValues>(key: K, value: ObjectiveFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function toggleSite(id: string) {
    setValues((v) => ({
      ...v,
      siteIds: v.siteIds.includes(id) ? v.siteIds.filter((s) => s !== id) : [...v.siteIds, id],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = {
        title: values.title,
        description: values.description,
        parentId: values.parentId || null,
        siteIds: values.siteIds,
        focusTerms: values.focusTerms,
        rivalTerms: values.rivalTerms,
        targetShare: values.targetShare === "" ? null : Number(values.targetShare),
        deadline: values.deadline || null,
        entityName: values.entityName,
        wikiArticles: values.wikiArticles,
        mediaBlogs: values.mediaBlogs,
        guestSites: values.guestSites,
        socialProfiles: values.socialProfiles,
        directories: values.directories,
        rivalSites: values.rivalSites,
        ...(mode === "edit" ? { status: values.status } : {}),
      };
      const res = await fetch(
        mode === "create" ? "/api/objectives" : `/api/objectives/${values.id}`,
        {
          method: mode === "create" ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Échec de l'enregistrement");
      setOpen(false);
      if (mode === "create") router.push(`/objectives/${body.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de l'enregistrement");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant={triggerVariant} size={triggerSize} />}>
        {mode === "create" ? <Plus className="size-3.5" /> : <Pencil className="size-3.5" />}
        {triggerLabel ?? (mode === "create" ? "Nouvel objectif" : "Modifier")}
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Nouvel objectif" : "Modifier l'objectif"}</DialogTitle>
          <DialogDescription>
            {"Un objectif est un but qui traverse vos sites. Les termes définissent ce que la plateforme mesure et les tâches qu'elle propose."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Titre">
            <input
              className={inputClass}
              value={values.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="Développer la visibilité de la langue savoyarde"
              required
              autoFocus
            />
          </Field>

          <Field label="Description (facultatif)">
            <textarea
              className={textareaClass}
              rows={2}
              value={values.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Ce que « réussi » veut dire pour cet objectif"
            />
          </Field>

          {parents.length > 0 && (
            <Field label="Objectif parent">
              <select
                className={inputClass}
                value={values.parentId}
                onChange={(e) => set("parentId", e.target.value)}
              >
                <option value="">Aucun (objectif racine)</option>
                {parents.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <Field
            label="Sites concernés"
            hint={values.siteIds.length === 0 ? "Aucune case cochée = tous vos sites" : undefined}
          >
            <div className="flex flex-wrap gap-2">
              {sites.map((s) => {
                const on = values.siteIds.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleSite(s.id)}
                    className={
                      "rounded-full border px-3 py-1 text-xs transition " +
                      (on
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-border text-muted-foreground hover:bg-muted")
                    }
                    aria-pressed={on}
                  >
                    {s.domain}
                  </button>
                );
              })}
            </div>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Termes à défendre" hint="Un par ligne ou séparés par des virgules">
              <textarea
                className={textareaClass}
                rows={3}
                value={values.focusTerms}
                onChange={(e) => set("focusTerms", e.target.value)}
                placeholder={"langue savoyarde\nsavoyard"}
              />
            </Field>
            <Field label="Termes concurrents" hint="Le vocabulaire à capter">
              <textarea
                className={textareaClass}
                rows={3}
                value={values.rivalTerms}
                onChange={(e) => set("rivalTerms", e.target.value)}
                placeholder={"francoprovençal\narpitan\npatois savoyard"}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Part de demande cible (%)">
              <input
                className={inputClass}
                type="number"
                min={0}
                max={100}
                step={1}
                value={values.targetShare}
                onChange={(e) => set("targetShare", e.target.value)}
                placeholder="50"
              />
            </Field>
            <Field label="Échéance">
              <input
                className={inputClass}
                type="date"
                value={values.deadline}
                onChange={(e) => set("deadline", e.target.value)}
              />
            </Field>
            {mode === "edit" && (
              <Field label="Statut">
                <select
                  className={inputClass}
                  value={values.status}
                  onChange={(e) => set("status", e.target.value as ObjectiveFormValues["status"])}
                >
                  <option value="ACTIVE">Actif</option>
                  <option value="PAUSED">En pause</option>
                  <option value="DONE">Atteint</option>
                </select>
              </Field>
            )}
          </div>

          <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
            <button
              type="button"
              onClick={() => setShowNotoriety((v) => !v)}
              className="flex w-full items-center justify-between text-left text-sm font-medium text-foreground"
              aria-expanded={showNotoriety}
            >
              <span>Notoriété hors site</span>
              <span className="text-xs text-muted-foreground">{showNotoriety ? "Masquer" : "Afficher"}</span>
            </button>
            {showNotoriety && (
              <div className="mt-3 space-y-4">
                <Field label="Nom de l'entité" hint="Tel qu'il doit apparaître sur Wikipédia, Wikidata et la fiche Google">
                  <input
                    className={inputClass}
                    value={values.entityName}
                    onChange={(e) => set("entityName", e.target.value)}
                    placeholder="Institut de la langue savoyarde"
                  />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Articles Wikipédia à surveiller" hint="Titres exacts de fr.wikipedia.org">
                    <textarea className={textareaClass} rows={3} value={values.wikiArticles} onChange={(e) => set("wikiArticles", e.target.value)} placeholder={"Savoyard (langue)\nFrancoprovençal"} />
                  </Field>
                  <Field label="Profils sociaux" hint="URL publiques, une par ligne">
                    <textarea className={textareaClass} rows={3} value={values.socialProfiles} onChange={(e) => set("socialProfiles", e.target.value)} placeholder={"https://www.youtube.com/@…\nhttps://www.facebook.com/…"} />
                  </Field>
                  <Field label="Blogs de médias où je peux écrire" hint="Club de Mediapart, blogs du Temps…">
                    <textarea className={textareaClass} rows={3} value={values.mediaBlogs} onChange={(e) => set("mediaBlogs", e.target.value)} placeholder={"mediapart.fr\nletemps.ch"} />
                  </Field>
                  <Field label="Sites où je peux publier" hint="Vos accès contributeur">
                    <textarea className={textareaClass} rows={3} value={values.guestSites} onChange={(e) => set("guestSites", e.target.value)} placeholder={"mordus2savoie.com\nnosalpes.eu"} />
                  </Field>
                  <Field label="Sites concurrents" hint="Ceux qui portent le vocabulaire concurrent : écart de liens (DataForSEO)">
                    <textarea className={textareaClass} rows={3} value={values.rivalSites} onChange={(e) => set("rivalSites", e.target.value)} placeholder={"arpitania.eu"} />
                  </Field>
                  <Field label="Annuaires et listes" hint="Où l'entité devrait figurer">
                    <textarea className={textareaClass} rows={3} value={values.directories} onChange={(e) => set("directories", e.target.value)} placeholder={"annuaire-associations.fr"} />
                  </Field>
                </div>
              </div>
            )}
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" size="sm" disabled={saving || !values.title.trim()}>
              {saving ? "Enregistrement…" : mode === "create" ? "Créer l'objectif" : "Enregistrer"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );
}
