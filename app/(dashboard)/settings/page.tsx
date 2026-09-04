import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { appBaseUrl, LINK_CALLBACK_PATH, listGoogleAccounts } from "@/lib/google/accounts";
import { PageHeader } from "@/components/ui/page-header";
import { GoogleAccountsSection } from "@/components/settings/google-accounts-section";

interface Props {
  searchParams: Promise<{ linked?: string; error?: string }>;
}

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

  return (
    <div>
      <PageHeader
        eyebrow="Compte"
        title="Comptes Google"
        description="Un espace CrawlSEO, plusieurs identités Google : chaque site lit la Search Console avec le compte qui possède sa propriété."
      />
      <GoogleAccountsSection
        accounts={accounts}
        notice={linked ? `Compte ${linked} lié.` : null}
        error={error ?? null}
        redirectUri={redirectUri}
      />
    </div>
  );
}
