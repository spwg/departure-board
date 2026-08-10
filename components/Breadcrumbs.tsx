import Link from "next/link";

export type BreadcrumbParent = {
  label: string;
  href: string;
};

/**
 * Shows the current location without hiding the board behind a navigation
 * control. Parent pages stay links; the current page remains the semantic
 * board heading while using the same compact scale as the breadcrumb.
 */
export function Breadcrumbs({
  parents,
  current,
  subtitle,
}: {
  parents: BreadcrumbParent[];
  current: string;
  subtitle?: string | null;
}) {
  return (
    <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
      <ol className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted sm:text-sm">
        {parents.map((parent) => (
          <li key={`${parent.href}:${parent.label}`} className="flex shrink-0 items-center gap-1.5">
            <Link
              href={parent.href}
              className="rounded-sm transition-colors hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
            >
              {parent.label}
            </Link>
            <span aria-hidden className="text-faint">›</span>
          </li>
        ))}
        <li aria-current="page" className="min-w-0 basis-full sm:basis-auto sm:max-w-md">
          <h1 className="truncate text-sm font-medium text-text">
            {current}
          </h1>
          {subtitle && <p className="truncate text-xs text-muted">{subtitle}</p>}
        </li>
      </ol>
    </nav>
  );
}
