import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { appBaseUrl, LINK_CALLBACK_PATH, listGoogleAccounts } from "@/lib/google/accounts";
import { PageHeader } from "@/components/ui/page-header";
import { GoogleAccountsSection } from "@/components/settings/google-accounts-section";
import { ApiKeysSection } from "@/components/settings/api-keys-section";
import { ApifySection } from "@/components/settings/apify-section";
import { ProviderKeySection } from "@/components/settings/provider-key-section";
import { McpPageContent } from "@/components/mcp/mcp-page-content";

interface Props {
  searchParams: Promise<{ linked?: string; error?: string }>;
}

/**
 * Everything that belongs to the workspace rather than to one site: the
 * Google identities, the external API keys, the AI agent connection.
 */
export default async function AccountSettingsPage({ searchParams }: Props) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { linked, error } = await searchParams;

  const accounts = await listGoogleAccounts(session.user.id);

  let redirectUri: string | null = null;
  try {
    redirectUri = `${appBaseUrl()}${LINK_CALLBACK_PATH}`;
  } catch {
    redirectUri = null;
  }

  const apiKeys = await db.apiKey.findMany({
    where: { userId: session.user.id },
    select: { provider: true, updatedAt: true },
  });
  const apiKeyStatus: Record<string, { connected: boolean; updatedAt?: string }> = {
    dataforseo: { connected: false },
    apify: { connected: false },
    perplexity: { connected: false },
    openai: { connected: false },
  };
  for (const key of apiKeys) {
    apiKeyStatus[key.provider] = { connected: true, updatedAt: key.updatedAt.toISOString() };
  }

  return (
    <div>
      <PageHeader
        eyebrow="Compte"
        title="Paramètres du compte"
        description="Comptes Google, clés des services externes et connexion des agents IA : ce qui vaut pour tout l'espace, pas pour un seul site."
      />

      <div className="space-y-8">
        <section id="google" className="scroll-mt-6 space-y-4">
          <SectionTitle
            title="Comptes Google"
            text="Un espace CrawlSEO, plusieurs identités Google : chaque site lit la Search Console avec le compte qui possède sa propriété."
          />
          <GoogleAccountsSection
            accounts={accounts}
            notice={linked ? `Compte ${linked} lié.` : null}
            error={error ?? null}
            redirectUri={redirectUri}
          />
        </section>

        <section id="api-keys" className="scroll-mt-6 space-y-4">
          <SectionTitle
            title="Services externes"
            text="Clés utilisées par tous vos sites et objectifs : DataForSEO pour les SERP et les backlinks, Apify pour les réseaux fermés."
          />
          <ApiKeysSection initialStatus={apiKeyStatus} />
          <ApifySection initialStatus={apiKeyStatus.apify} />
          <ProviderKeySection
            provider="perplexity"
            title="Perplexity"
            description="Mesure « Cité par les IA » des objectifs : vos questions posées à Perplexity, sources citées"
            label="Clé d'API (perplexity.ai, Settings, API)"
            placeholder="pplx-…"
            hint="Une mesure pose jusqu'à huit questions au modèle sonar : quelques centimes."
            initialStatus={apiKeyStatus.perplexity}
          />
          <ProviderKeySection
            provider="openai"
            title="OpenAI (ChatGPT)"
            description="Mesure « Cité par les IA » des objectifs : vos questions posées à ChatGPT avec recherche web, sources citées"
            label="Clé d'API (platform.openai.com, API keys)"
            placeholder="sk-…"
            hint="Une mesure pose jusqu'à huit questions à gpt-4.1-mini avec l'outil de recherche web : quelques centimes."
            initialStatus={apiKeyStatus.openai}
          />
        </section>

        <section id="mcp" className="scroll-mt-6 space-y-4">
          <SectionTitle
            title="IA & MCP"
            text="Connectez votre agent IA à CrawlSEO via le Model Context Protocol."
          />
          <McpPageContent />
        </section>
      </div>
    </div>
  );
}

function SectionTitle({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <h2 className="font-heading text-xl font-semibold text-foreground">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
