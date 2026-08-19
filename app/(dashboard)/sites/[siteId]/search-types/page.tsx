import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { SearchTypesClient } from "@/components/research/search-types-client";

interface Props {
  params: Promise<{ siteId: string }>;
}

export default async function SearchTypesPage({ params }: Props) {
  const session = await auth();
  const { siteId } = await params;

  const site = await db.site.findUnique({
    where: { id: siteId },
    select: { userId: true, domain: true, gscProperty: true },
  });
  if (!site || site.userId !== session?.user?.id) redirect("/sites");

  return (
    <div>
      <PageHeader
        eyebrow={site.domain}
        title="Search Types"
        description="How your site performs across Google surfaces: Web, Images, Video, News, and Discover"
      />
      <SearchTypesClient siteId={siteId} hasGsc={!!site.gscProperty} />
    </div>
  );
}
