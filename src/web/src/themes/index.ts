import { nbn } from "./nbn/theme";
import { spun } from "./spun/theme";

export type Mode = "light" | "dark" | "auto";

export type Theme = {
  id: string;
  label: string;
  icon: string;
  modes: readonly Mode[];
};

// The picker shows the themes in this order; the first is the default. Each
// theme's directory has a theme.scss, which scripts/themes.mts compiles to
// public/themes/<id>/theme.css.
export const THEMES: readonly Theme[] = [spun, nbn];

export const MODES: Record<Mode, { label: string; icon: string }> = {
  light: { label: "Light", icon: "bi-sun-fill" },
  dark: { label: "Dark", icon: "bi-moon-stars-fill" },
  auto: { label: "Auto", icon: "bi-circle-half" },
};

export const THEME_COOKIE = "SPUN-theme";
// Same cookie as the other NextBestNetwork sites, so the mode follows the user there.
export const MODE_COOKIE = "NBN-theme";

export const THEME_LINK_ID = "theme-css";

export function themeHref(id: string) {
  return `/themes/${id}/theme.css`;
}

export function findTheme(id: string | null | undefined): Theme {
  return THEMES.find((theme) => theme.id === id) ?? THEMES[0];
}

export function resolveMode(theme: Theme, stored: string | null | undefined): Mode {
  const mode = theme.modes.find((m) => m === stored);
  if (mode) return mode;
  return theme.modes.includes("auto") ? "auto" : theme.modes[0];
}
