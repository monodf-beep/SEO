"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronsUpDown, LogOut, UserCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type UserMenuProps = {
  email?: string | null;
  name?: string | null;
  image?: string | null;
  collapsed: boolean;
};

export function UserMenu({ email, name, image, collapsed }: UserMenuProps) {
  const displayName = name || email?.split("@")[0] || "Utilisateur";
  const initial = displayName.charAt(0).toUpperCase();
  const [imgError, setImgError] = useState(false);
  const showImage = image && !imgError;

  const avatar = showImage ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={image}
      alt=""
      className="size-7 shrink-0 rounded-full object-cover"
      onError={() => setImgError(true)}
    />
  ) : (
    <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-blue-400 text-xs font-semibold text-primary-foreground">
      {initial}
    </div>
  );

  return (
    <Popover>
      <PopoverTrigger
        aria-label="Menu du compte"
        className={cn(
          "flex w-full items-center gap-2.5 rounded-xl text-left transition hover:bg-muted data-popup-open:bg-muted",
          collapsed ? "justify-center p-1.5" : "px-2 py-1.5"
        )}
      >
        {avatar}
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
              {displayName}
            </span>
            <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
          </>
        )}
      </PopoverTrigger>

      <PopoverContent
        side={collapsed ? "right" : "top"}
        align={collapsed ? "end" : "start"}
      >
        <div className="px-2 py-1.5">
          <p className="truncate text-sm font-medium text-foreground">{displayName}</p>
          {email && (
            <p className="truncate text-[11px] text-muted-foreground">{email}</p>
          )}
        </div>

        <div className="my-1 h-px bg-border" />

        <div className="flex items-center justify-between gap-2 px-2 py-1.5">
          <span className="text-xs text-muted-foreground">Thème</span>
          <ThemeToggle />
        </div>

        <Link
          href="/settings"
          className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-foreground transition hover:bg-muted"
        >
          <UserCircle className="size-4 text-muted-foreground" />
          Paramètres du compte
        </Link>

        <div className="my-1 h-px bg-border" />

        <Link
          href="/api/auth/signout"
          prefetch={false}
          className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-foreground transition hover:bg-muted"
        >
          <LogOut className="size-4 text-muted-foreground" />
          Déconnexion
        </Link>
      </PopoverContent>
    </Popover>
  );
}
