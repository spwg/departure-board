import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SettingsPage } from "@/components/SettingsPage";
import { ThemeSync } from "@/components/ThemeSync";
import { applyTheme, THEME_COLORS, THEME_STORAGE_KEY, themeScript, type ThemePreference } from "@/lib/theme";

function overrideMeta() {
  return document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]#theme-color-override');
}

function resetDocument() {
  document.documentElement.removeAttribute("data-theme");
  document.head.innerHTML = "";
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  resetDocument();
});

describe("theme override", () => {
  it("defaults to following the device and leaves the page untouched", () => {
    render(<SettingsPage />);
    expect(screen.getByRole("radio", { name: "System" }).getAttribute("aria-checked")).toBe("true");
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    expect(overrideMeta()).toBeNull();
  });

  it("forces dark from Settings, tints the browser chrome, and saves the choice", () => {
    render(<SettingsPage />);
    const dark = screen.getByRole("radio", { name: "Dark" });
    fireEvent.click(dark);

    expect(dark.getAttribute("aria-checked")).toBe("true");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(overrideMeta()?.content).toBe(THEME_COLORS.dark);
    // First in <head>, so it wins over Next's media-query theme-color pair.
    expect(document.head.firstElementChild).toBe(overrideMeta());
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });

  it("returns control to the device when System is chosen again", () => {
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole("radio", { name: "Light" }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");

    fireEvent.click(screen.getByRole("radio", { name: "System" }));
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    expect(overrideMeta()).toBeNull();
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it("pre-paint script applies a saved theme exactly as applyTheme does", () => {
    for (const saved of ["light", "dark", "system", null, "bogus"] as const) {
      if (saved === null) window.localStorage.removeItem(THEME_STORAGE_KEY);
      else window.localStorage.setItem(THEME_STORAGE_KEY, saved);

      new Function(themeScript)();
      const fromScript = { theme: document.documentElement.getAttribute("data-theme"), head: document.head.innerHTML };
      resetDocument();

      applyTheme(saved === "light" || saved === "dark" ? saved : ("system" satisfies ThemePreference));
      const fromApply = { theme: document.documentElement.getAttribute("data-theme"), head: document.head.innerHTML };
      resetDocument();

      expect(fromScript, String(saved)).toEqual(fromApply);
    }
  });

  it("follows a theme chosen in another tab", () => {
    render(<ThemeSync />);
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: THEME_STORAGE_KEY, newValue: "dark" }));
    });
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });
});
