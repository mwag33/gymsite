// Manual light/dark override, stored on-device (not synced via UserSettings/
// Firestore - this is a display preference, not training data). "system"
// (the default) keeps the original prefers-color-scheme-driven behavior;
// an explicit "light"/"dark" choice stamps documentElement's data-theme
// attribute, which index.css's [data-theme="..."] rules take priority over
// the OS media query for. See index.html for the inline script that applies
// the stored preference before first paint, avoiding a flash of the wrong
// theme.
export type ThemePreference = "system" | "light" | "dark";

const STORAGE_KEY = "gymsite:themePreference";

export function getStoredTheme(): ThemePreference {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw === "light" || raw === "dark" ? raw : "system";
}

export function applyTheme(pref: ThemePreference): void {
  if (pref === "system") {
    delete document.documentElement.dataset.theme;
  } else {
    document.documentElement.dataset.theme = pref;
  }
}

export function setStoredTheme(pref: ThemePreference): void {
  localStorage.setItem(STORAGE_KEY, pref);
  applyTheme(pref);
}
