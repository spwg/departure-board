import Link from "next/link";

/** A compact link to the full settings page. */
export function SettingsButton({ variant = "icon" }: { variant?: "icon" | "menu-item" }) {
  return (
    <Link
      href="/settings"
      aria-label="Settings"
      className={variant === "menu-item"
        ? "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-bg focus-visible:bg-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
        : "grid h-10 w-10 place-items-center rounded-full text-muted transition-colors hover:bg-bg hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"}
    >
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5 shrink-0 text-muted"
          fill="currentColor"
          aria-hidden
        >
          <path d="M19.43 12.98c.04-.32.07-.65.07-.98s-.03-.66-.08-.98l2.11-1.65a.5.5 0 00.12-.64l-2-3.46a.5.5 0 00-.61-.22l-2.49 1a7.3 7.3 0 00-1.69-.98L14.5 2.42A.5.5 0 0014 2h-4a.5.5 0 00-.49.42l-.38 2.65c-.61.25-1.18.59-1.69.98l-2.49-1a.5.5 0 00-.61.22l-2 3.46a.5.5 0 00.12.64L4.57 11c-.04.32-.07.65-.07.98s.03.66.08.98l-2.11 1.65a.5.5 0 00-.12.64l2 3.46c.13.22.39.31.61.22l2.49-1c.51.4 1.08.73 1.69.98l.38 2.65c.04.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.18-.59 1.69-.98l2.49 1c.22.09.48 0 .61-.22l2-3.46a.5.5 0 00-.12-.64l-2.09-1.65zM12 15.5A3.5 3.5 0 1112 8a3.5 3.5 0 010 7.5z" />
        </svg>
        {variant === "menu-item" && <span>Settings</span>}
    </Link>
  );
}
