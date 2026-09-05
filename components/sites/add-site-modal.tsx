"use client";

import { useState } from "react";
import { propertyDomain, propertyKind, propertyLabel } from "@/lib/google/gsc-client";
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

interface LinkedAccount {
  id: string;
  email: string;
  isPrimary: boolean;
}

export function AddSiteModal({
  triggerLabel = "Ajouter un site",
}: {
  triggerLabel?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [properties, setProperties] = useState<GSCProperty[]>([]);
  const [accounts, setAccounts] = useState<LinkedAccount[]>([]);
  const [accountId, setAccountId] = useState<string>("");
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
        const initial = await loadAccounts();
        await loadGSCProperties(initial);
      }
    }
  }

  /** Linked Google accounts; the login one is selected by default. */
  async function loadAccounts(): Promise<string> {
    try {
      const res = await fetch("/api/google/accounts");
      if (!res.ok) return "";
      const list = (await res.json()) as LinkedAccount[];
      setAccounts(list);
      const primary = list.find((a) => a.isPrimary) ?? list[0];
      const id = primary?.id ?? "";
      setAccountId(id);
      return id;
    } catch {
      return "";
    }
  }

  async function switchAccount(id: string) {
    setAccountId(id);
    setSelectedProperty("");
    await loadGSCProperties(id);
  }

  async function loadGSCProperties(forAccount: string = accountId) {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        forAccount ? `/api/gsc/properties?account=${encodeURIComponent(forAccount)}` : "/api/gsc/properties"
      );
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
      const domain = propertyDomain(selectedProperty);
      const kind = propertyKind(selectedProperty) ?? "WEBSITE";

      const response = await fetch("/api/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain,
          kind,
          gscProperty: selectedProperty,
          googleAccountId: accountId || null,
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

          {accounts.length > 1 && (
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                Compte Google
              </label>
              <select
                value={accountId}
                onChange={(e) => switchAccount(e.target.value)}
                disabled={loading || adding}
                className="h-9 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.email}
                    {a.isPrimary ? " (connexion)" : ""}
                  </option>
                ))}
              </select>
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
                    {propertyLabel(prop.siteUrl)}
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
