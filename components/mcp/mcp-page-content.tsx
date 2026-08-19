"use client";

import { useState } from "react";
import {
  Copy,
  Check,
  Terminal,
  Monitor,
  Code2,
  Globe,
  Search,
  FileText,
  Bug,
  Gauge,
  Lightbulb,
  BarChart3,
  Rocket,
} from "lucide-react";

const CONFIG_JSON = `{
  "mcpServers": {
    "crawlseo": {
      "command": "npx",
      "args": ["tsx", "mcp/server.ts"],
      "cwd": "/path/to/crawlseo"
    }
  }
}`;

const TOOLS = [
  {
    category: "Sites",
    items: [
      { name: "list_sites", description: "Lister tous les sites suivis avec leurs infos de base" },
      { name: "get_site_overview", description: "KPI du site, score de santé, dernier crawl et vitals" },
    ],
  },
  {
    category: "Mots-clés & Pages",
    items: [
      { name: "get_keywords", description: "Meilleurs mots-clés par clics, avec position et CTR" },
      { name: "get_pages", description: "Meilleures pages par clics, avec position et CTR" },
      { name: "get_traffic", description: "Clics et impressions quotidiens dans le temps" },
    ],
  },
  {
    category: "Crawl & Audit",
    items: [
      { name: "run_crawl", description: "Lancer un crawl du site en arrière-plan" },
      { name: "get_crawl_status", description: "Vérifier l'avancement et les résultats d'un crawl" },
      { name: "get_crawl_issues", description: "Lister les problèmes détectés par un crawl" },
    ],
  },
  {
    category: "Performance & SEO",
    items: [
      { name: "get_vitals", description: "Rapports Core Web Vitals (LCP, CLS, INP, TTFB)" },
      { name: "get_opportunities", description: "Opportunités SEO : striking distance, CTR faible, déclin" },
    ],
  },
];

const SETUP_GUIDES = [
  {
    name: "Claude Code",
    icon: Terminal,
    steps: [
      "Installer tsx : npm install -D tsx",
      "Ajouter le JSON de config à .claude/settings.json",
      "Remplacer /path/to/crawlseo par le chemin de votre projet",
      "Redémarrer Claude Code — les outils sont disponibles immédiatement",
    ],
  },
  {
    name: "Claude Desktop",
    icon: Monitor,
    steps: [
      "Ouvrir les paramètres de Claude Desktop",
      "Aller dans Développeur > Serveurs MCP",
      "Ajouter un nouveau serveur avec le JSON de config ci-dessous",
      "Remplacer /path/to/crawlseo par le chemin de votre projet",
      "Redémarrer Claude Desktop",
    ],
  },
  {
    name: "Cursor",
    icon: Code2,
    steps: [
      "Ouvrir les paramètres de Cursor (Cmd/Ctrl + ,)",
      "Chercher « MCP » dans les paramètres",
      "Ajouter le JSON de config du serveur",
      "Remplacer /path/to/crawlseo par le chemin de votre projet",
      "Redémarrer Cursor",
    ],
  },
];

const ROADMAP = [
  { label: "Transport distant OAuth2", description: "Connexion depuis des agents IA hébergés, sans installation locale" },
  { label: "Outils de recherche de mots-clés", description: "Rechercher des mots-clés et enregistrer les résultats via MCP" },
  { label: "Outils d'analyse de backlinks", description: "Interroger les backlinks directement depuis les agents IA" },
  { label: "Assistant conversationnel", description: "Questions-réponses SEO en langage naturel sur vos données" },
];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
    >
      {copied ? (
        <>
          <Check className="size-3 text-signal" />
          Copié
        </>
      ) : (
        <>
          <Copy className="size-3" />
          Copier
        </>
      )}
    </button>
  );
}

export function McpPageContent() {
  return (
    <div className="space-y-6">
      {/* Connection config */}
      <div className="panel p-5">
        <h3 className="font-heading text-lg font-semibold text-foreground">
          Connexion MCP
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Ajoutez cette configuration à votre outil IA pour le connecter au serveur MCP de CrawlSEO.
        </p>
        <div className="mt-4 relative">
          <div className="absolute right-3 top-3">
            <CopyButton text={CONFIG_JSON} />
          </div>
          <pre className="overflow-x-auto rounded-lg border border-border bg-background p-4 text-sm text-foreground">
            <code>{CONFIG_JSON}</code>
          </pre>
        </div>
      </div>

      {/* Setup guides */}
      <div className="panel p-5">
        <h3 className="font-heading text-lg font-semibold text-foreground">
          Guides d'installation
        </h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {SETUP_GUIDES.map((guide) => {
            const Icon = guide.icon;
            return (
              <div
                key={guide.name}
                className="rounded-lg border border-border bg-card p-4"
              >
                <div className="mb-3 flex items-center gap-2">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="size-4" />
                  </div>
                  <h4 className="font-medium text-foreground">{guide.name}</h4>
                </div>
                <ol className="space-y-1.5 text-xs text-muted-foreground">
                  {guide.steps.map((step, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="shrink-0 font-medium text-primary">
                        {i + 1}.
                      </span>
                      {step}
                    </li>
                  ))}
                </ol>
              </div>
            );
          })}
        </div>
      </div>

      {/* Available tools */}
      <div className="panel p-5">
        <h3 className="font-heading text-lg font-semibold text-foreground">
          Outils disponibles
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          10 outils répartis en 4 catégories
        </p>
        <div className="mt-4 space-y-4">
          {TOOLS.map((group) => (
            <div key={group.category}>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {group.category}
              </h4>
              <div className="space-y-1.5">
                {group.items.map((tool) => (
                  <div
                    key={tool.name}
                    className="flex items-start gap-3 rounded-lg border border-border/50 bg-card/50 px-3 py-2.5"
                  >
                    <code className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
                      {tool.name}
                    </code>
                    <span className="text-sm text-muted-foreground">
                      {tool.description}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Roadmap */}
      <div className="panel p-5">
        <h3 className="flex items-center gap-2 font-heading text-lg font-semibold text-foreground">
          <Rocket className="size-5 text-primary" />
          Feuille de route
        </h3>
        <div className="mt-4 space-y-3">
          {ROADMAP.map((item) => (
            <div
              key={item.label}
              className="flex items-start gap-3 rounded-lg border border-dashed border-border/50 px-3 py-2.5"
            >
              <div className="mt-0.5 size-2 shrink-0 rounded-full bg-primary/40" />
              <div>
                <p className="text-sm font-medium text-foreground">{item.label}</p>
                <p className="text-xs text-muted-foreground">{item.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
