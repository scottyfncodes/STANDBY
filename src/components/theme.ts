"use client";

import { useCallback, useEffect, useState } from "react";
import { THEME_KEY } from "./theme-script";

export type ThemePref = "system" | "light" | "dark";

declare global {
  interface Window {
    __standbyTheme?: () => void;
  }
}

/** The Appearance setting. null until read on the client. */
export function useThemePref(): [ThemePref | null, (p: ThemePref) => void] {
  const [pref, setPref] = useState<ThemePref | null>(null);
  useEffect(() => {
    try {
      const v = JSON.parse(window.localStorage.getItem(THEME_KEY) ?? "null");
      setPref(v === "light" || v === "dark" ? v : "system");
    } catch {
      setPref("system");
    }
  }, []);
  const update = useCallback((p: ThemePref) => {
    setPref(p);
    try {
      if (p === "system") window.localStorage.removeItem(THEME_KEY);
      else window.localStorage.setItem(THEME_KEY, JSON.stringify(p));
    } catch {
      // Storage blocked (private mode): still apply for this page view.
      document.documentElement.setAttribute("data-theme", p === "system" ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : p);
      return;
    }
    window.__standbyTheme?.();
  }, []);
  return [pref, update];
}
