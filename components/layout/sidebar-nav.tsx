"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Globe,
  Search,
  FileText,
  Bug,
  Gauge,
  Lightbulb,
  Bell,
  Settings,
  Bookmark,
  Link as LinkIcon,
  SearchCheck,
  Target,
  type LucideIcon,
} from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

export function SidebarNav({
  sites,
  collapsed = false,
}: {
  sites: { id: string; domain: string; kind?: "WEBSITE" | "PROFILE" }[];
  collapsed?: boolean;
}) {
  const pathname = usePathname();
  const match = pathname.match(/\/sites\/([^/]+)/);
  const activeSiteId =
    match?.[1] && sites.some((s) => s.id === match[1]) ? match[1] : undefined;
  // A creator profile has no pages of its own: nothing to crawl or measure.
  const isProfile = sites.find((s) => s.id === activeSiteId)?.kind === "PROFILE";

  const overviewNav: NavGroup = {
    label: "Vue d'ensemble",
    items: [
      { href: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard },
      { href: "/sites", label: "Sites", icon: Globe, exact: true },
      { href: "/objectives", label: "Objectifs", icon: Target },
      { href: "/settings", label: "Paramètres du compte", icon: Settings },
    ],
  };

  const workspaceNav: NavGroup | null = activeSiteId
    ? {
        label: "Espace de travail",
        items: [
          { href: `/sites/${activeSiteId}`, label: "Vue d'ensemble", icon: LayoutDashboard, exact: true },
          { href: `/sites/${activeSiteId}/keywords`, label: "Mots-clés", icon: Search },
          { href: `/sites/${activeSiteId}/saved-keywords`, label: "Mots-clés suivis", icon: Bookmark },
          { href: `/sites/${activeSiteId}/pages`, label: "Pages", icon: FileText },
          ...(isProfile
            ? []
            : [
                { href: `/sites/${activeSiteId}/crawl`, label: "Crawl / Audit", icon: Bug },
                { href: `/sites/${activeSiteId}/vitals`, label: "Vitals", icon: Gauge },
              ]),
          { href: `/sites/${activeSiteId}/opportunities`, label: "Opportunités", icon: Lightbulb },
          { href: `/sites/${activeSiteId}/alerts`, label: "Alertes", icon: Bell },
          { href: `/sites/${activeSiteId}/settings`, label: "Paramètres du site", icon: Settings },
        ],
      }
    : null;

  const researchNav: NavGroup | null = activeSiteId
    ? {
        label: "Recherche",
        items: [
          { href: `/sites/${activeSiteId}/keyword-research`, label: "Recherche de mots-clés", icon: SearchCheck },
          { href: `/sites/${activeSiteId}/domain-overview`, label: "Aperçu de domaine", icon: Globe },
          { href: `/sites/${activeSiteId}/backlinks`, label: "Backlinks", icon: LinkIcon },
        ],
      }
    : null;

  const groups = [overviewNav, workspaceNav, researchNav].filter(
    (g): g is NavGroup => g !== null
  );

  return (
    <nav className="flex-1 space-y-5 overflow-y-auto px-2 text-sm">
      {groups.map((group) => (
        <div key={group.label}>
          {!collapsed && (
            <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {group.label}
            </p>
          )}
          <div className="space-y-0.5">
            {group.items.map((item) => (
              <SidebarLink
                key={item.href}
                item={item}
                pathname={pathname}
                collapsed={collapsed}
              />
            ))}
          </div>
        </div>
      ))}

      {/* Properties quick list */}
      {!collapsed && sites.length > 1 && (
        <div>
          <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Propriétés
          </p>
          <div className="space-y-0.5">
            {sites.slice(0, 6).map((s) => {
              const active = activeSiteId === s.id;
              return (
                <Link
                  key={s.id}
                  href={`/sites/${s.id}`}
                  className={cn(
                    "block truncate rounded-xl px-3 py-2 text-sm transition",
                    active
                      ? "bg-sidebar-accent text-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  {s.domain}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </nav>
  );
}

function SidebarLink({
  item,
  pathname,
  collapsed,
}: {
  item: NavItem;
  pathname: string;
  collapsed: boolean;
}) {
  const active = item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`);

  const Icon = item.icon;

  if (collapsed) {
    return (
      <Link
        href={item.href}
        title={item.label}
        className={cn(
          "flex size-10 items-center justify-center rounded-xl transition",
          active
            ? "bg-primary/15 text-primary"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        )}
      >
        <Icon className="size-4" />
      </Link>
    );
  }

  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors duration-200",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/75 hover:bg-muted hover:text-foreground"
      )}
    >
      <Icon className="size-4 shrink-0" />
      {item.label}
    </Link>
  );
}
