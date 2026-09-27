"use client";

import { useEffect } from "react";
import { subscribeToOtherTabs } from "@/lib/themePreference";


/** Keeps every open tab on the theme most recently chosen in any of them. */
export function ThemeSync() {
  useEffect(subscribeToOtherTabs, []);
  return null;
}
