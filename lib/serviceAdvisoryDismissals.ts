import type { ServiceAdvisory } from "./serviceAdvisories";

const STORAGE_KEY = "departure-board:dismissed-service-banners";
type Dismissals = Record<string, string>;

function read(): Dismissals {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, string] =>
        typeof entry[1] === "string",
      ),
    );
  } catch {
    return {};
  }
}

function write(value: Dismissals) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Storage can be disabled; the banner simply remains visible next time.
  }
}

/** Locally hides exactly this revision of one official notice. */
export function dismissServiceAdvisory(advisory: ServiceAdvisory) {
  write({ ...read(), [advisory.id]: advisory.revision });
}

/**
 * Returns the notices that should render and prunes revisions known to be
 * stale. Callers receive a contextual subset plus the current full feed's
 * compact identity map, so an absent contextual notice cannot invalidate a
 * dismissal, while removal from the authoritative RSS feed can.
 */
export function visibleServiceAdvisories(
  advisories: ServiceAdvisory[],
  authoritativeRevisions: Record<string, string>,
): ServiceAdvisory[] {
  const dismissals = read();
  const valid = Object.fromEntries(Object.entries(dismissals).filter(([id, revision]) => {
    return authoritativeRevisions[id] === revision;
  }));
  if (Object.keys(valid).length !== Object.keys(dismissals).length) write(valid);
  return advisories.filter((notice) => valid[notice.id] !== notice.revision);
}
