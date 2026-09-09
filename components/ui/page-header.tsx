import { cn } from "@/lib/utils";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: React.ReactNode;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between",
        className
      )}
    >
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-1 text-atom-caption font-semibold uppercase tracking-[0.12em] text-primary">
            {eyebrow}
          </p>
        )}
        <h1 className="font-heading text-atom-heading font-semibold tracking-tight text-foreground sm:text-atom-display1 sm:leading-[48px]">
          {title}
        </h1>
        {description && (
          <p className="mt-1 max-w-2xl text-atom-body text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {actions && (
        // Not shrink-0: an action slot that refuses to shrink pushes the
        // title column to zero width, and a long message in it (a Search
        // Console refusal, say) leaves the description rendering one word
        // per line. Capped at half the row instead, with long strings
        // wrapping inside it.
        <div className="flex min-w-0 flex-wrap items-center gap-2 break-words sm:max-w-[50%] sm:justify-end">
          {actions}
        </div>
      )}
    </div>
  );
}
