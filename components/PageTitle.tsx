/**
 * A page's heading beside the header's Home button. Pages carry no trail of
 * parents: Home is the one way up, and the browser's Back covers the rest.
 */
export function PageTitle({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string | null;
}) {
  return (
    <div className="min-w-0 flex-1 px-1">
      <h1 className="truncate text-sm font-medium text-text">{title}</h1>
      {subtitle && <p className="truncate text-xs text-muted">{subtitle}</p>}
    </div>
  );
}
