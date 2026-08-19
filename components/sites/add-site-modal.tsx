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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface GSCProperty {
  siteUrl: string;
  permissionLevel: string;
}

export function AddSiteModal({
  triggerLabel = "Ajouter un site",
}: {
  triggerLabel?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [properties, setProperties] = useState<GSCProperty[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState<string>("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleOpenChange(newOpen: boolean) {
    setOpen(newOpen);
    if (newOpen) {
      setSuccess(false);
      setError("");
      if (properties.length === 0) {
        await loadGSCProperties();
      }
    }
  }

  async function loadGSCProperties() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/gsc/properties");
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Échec du chargement des propriétés Search Console");
      }

      const data = (await response.json()) as GSCProperty[];
      setProperties(data || []);

      if (!data?.length) {
        setError(
          "Aucune propriété Search Console trouvée. Vérifiez que ce compte Google y a accès."
        );
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Échec du chargement des propriétés Search Console"
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleAddSite() {
    if (!selectedProperty) {
      setError("Sélectionnez d'abord une propriété");
      return;
    }

    setAdding(true);
    setError("");

    try {
      // Two GSC property shapes, and they must be told apart by prefix rather
      // than by "contains a colon": splitting a URL-prefix property on ":"
      // leaves "//example.com/", which no longer starts with "http", so the
      // branch below never runs and the malformed value reaches the database.
      let domain = selectedProperty;
      if (domain.startsWith("sc-domain:")) {
        // Domain property: sc-domain:example.com
        domain = domain.slice("sc-domain:".length);
      } else {
        // URL-prefix property: https://example.com/
        try {
          domain = new URL(domain).hostname;
        } catch {
          // keep as-is
        }
      }

      const response = await fetch("/api/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain,
          gscProperty: selectedProperty,
        }),
      });

      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(body.error || "Échec de l'ajout du site");
      }

      setSuccess(true);
      setSelectedProperty("");
      router.refresh();

      setTimeout(() => {
        setOpen(false);
        if (body.id) {
          router.push(`/sites/${body.id}`);
        }
      }, 800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de l'ajout du site");
    } finally {
      setAdding(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button />}>{triggerLabel}</DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connecter la Search Console</DialogTitle>
          <DialogDescription>
            Choisissez une propriété que vous gérez. L'accès demandé est en lecture seule.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {error && (
            <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </div>
          )}

          {success && (
            <div className="rounded-lg border border-signal/30 bg-signal-muted px-3 py-2 text-sm text-signal">
              Site connecté. Ouverture de l'espace de travail…
            </div>
          )}

          {loading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Chargement des propriétés depuis Google…
            </div>
          ) : properties.length > 0 ? (
            <Select
              value={selectedProperty}
              onValueChange={(value) => value !== null && setSelectedProperty(value)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Sélectionnez une propriété GSC…" />
              </SelectTrigger>
              <SelectContent>
                {properties.map((prop) => (
                  <SelectItem key={prop.siteUrl} value={prop.siteUrl}>
                    {prop.siteUrl}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={adding}
            >
              Annuler
            </Button>
            <Button
              type="button"
              onClick={handleAddSite}
              disabled={!selectedProperty || loading || adding}
            >
              {adding ? "Connexion…" : "Connecter le site"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
