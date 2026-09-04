"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { UserMenu } from "@/components/layout/user-menu";
import { SiteSwitcher } from "@/components/sites/site-switcher";
import { PanelLeftClose, PanelLeftOpen, Menu, X } from "lucide-react";

type AppShellProps = {
  email?: string | null;
  name?: string | null;
  image?: string | null;
  children: React.ReactNode;
  sites: { id: string; domain: string }[];
};

export function AppShell({
  email,
  name,
  image,
  children,
  sites,
}: AppShellProps) {
  const pathname = usePathname();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Load collapsed state from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("crawlseo-sidebar-collapsed");
    if (saved === "true") setCollapsed(true);
  }, []);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("crawlseo-sidebar-collapsed", String(next));
  }

  const sidebarContent = (
    <div className="flex h-full flex-col">
      {/* Logo / brand */}
      <div className={cn("flex items-center gap-2.5 px-4 py-3", collapsed && "justify-center px-2")}>
        <Link
          href="/dashboard"
          className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm"
        >
          <svg viewBox="0 0 24 24" className="size-4" fill="none" aria-hidden>
            <path
              d="M4 18 L12 5 L20 18"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinejoin="round"
            />
            <circle cx="12" cy="15.5" r="1.6" fill="currentColor" />
          </svg>
        </Link>
        {!collapsed && (
          <p className="text-[15px] font-semibold tracking-tight text-foreground">
            CrawlSEO
          </p>
        )}
      </div>

      {/* Site switcher */}
      {sites.length > 0 && !collapsed && (
        <div className="px-3 pb-3">
          <SiteSwitcher sites={sites} />
        </div>
      )}

      {/* Navigation */}
      <SidebarNav sites={sites} collapsed={collapsed} />

      {/* Bottom section */}
      <div className="mt-auto space-y-1 border-t border-sidebar-border px-2 pb-3 pt-2">
        <UserMenu email={email} name={name} image={image} collapsed={collapsed} />

        {/* Collapse toggle (desktop only) */}
        <button
          type="button"
          onClick={toggleCollapsed}
          className={cn(
            "hidden w-full items-center gap-2.5 rounded-xl text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground md:flex",
            collapsed ? "justify-center p-1.5" : "px-2 py-1.5"
          )}
        >
          {collapsed ? (
            <PanelLeftOpen className="size-4" />
          ) : (
            <>
              <PanelLeftClose className="size-4" />
              <span>Replier le menu</span>
            </>
          )}
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden h-screen sticky top-0 z-20 shrink-0 border-r border-sidebar-border bg-sidebar transition-[width] duration-200 md:block",
          collapsed ? "w-16" : "w-[260px]"
        )}
      >
        {sidebarContent}
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-[280px] border-r border-sidebar-border bg-sidebar transition-transform duration-200 md:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-end px-4 pt-4">
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-5" />
          </button>
        </div>
        {sidebarContent}
      </aside>

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="flex items-center justify-between border-b border-border bg-sidebar px-4 py-3 md:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Menu className="size-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <span className="text-xs font-bold">C</span>
            </div>
            <span className="font-semibold">CrawlSEO</span>
          </div>
          <ThemeToggle />
        </header>

        <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
