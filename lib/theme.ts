/*
 * Rider's colour-theme choice. "system" follows the OS; "light" and "dark"
 * override it by setting data-theme on <html>, which globals.css keys off.
 *
 * Kept free of React so the root layout (a Server Component) can embed the
 * pre-paint script, and the Settings hook can apply the same choice later.
 */

export type ThemePreference = "system" | "light" | "dark";

export const THEME_STORAGE_KEY = "departure-board:theme";
export const THEME_CHANGE_EVENT = "departure-board:theme-changed";

/** Browser chrome tint for each theme; matches --bg in globals.css. */
export const THEME_COLORS = { light: "#f4f4f5", dark: "#09090b" } as const;

/**
 * Inserted ahead of Next's media-query theme-color tags only while a theme is
 * forced. Browsers use the first matching theme-color, so this one wins, and
 * removing it hands control back to the OS-driven pair.
 */
const OVERRIDE_META_ID = "theme-color-override";

export function parseThemePreference(raw: string | null): ThemePreference {
  return raw === "light" || raw === "dark" ? raw : "system";
}

export function applyTheme(theme: ThemePreference): void {
  const root = document.documentElement;
  let meta = document.getElementById(OVERRIDE_META_ID);

  if (theme === "system") {
    root.removeAttribute("data-theme");
    meta?.remove();
    return;
  }

  root.setAttribute("data-theme", theme);
  if (!meta) {
    meta = document.createElement("meta");
    meta.id = OVERRIDE_META_ID;
    meta.setAttribute("name", "theme-color");
    document.head.prepend(meta);
  }
  meta.setAttribute("content", THEME_COLORS[theme]);
}

/**
 * Runs in <head> during HTML parsing, before first paint, so a forced theme
 * never flashes the OS one first. Mirrors applyTheme; the two are checked
 * against each other in tests.
 */
export const themeScript = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(t!=="light"&&t!=="dark")return;var c=${JSON.stringify(THEME_COLORS)};document.documentElement.setAttribute("data-theme",t);var m=document.createElement("meta");m.id=${JSON.stringify(OVERRIDE_META_ID)};m.setAttribute("name","theme-color");m.setAttribute("content",c[t]);document.head.prepend(m)}catch(e){}})()`;
