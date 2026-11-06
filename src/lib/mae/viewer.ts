// Who is using the app (Mahan or Elisa) + their personal theme colors (stored on this device).
import { useSyncExternalStore } from "react";

export type Viewer = "M" | "E";
export interface Theme { mahan: string; elisa: string; glow: number }
export const DEFAULT_THEME: Theme = { mahan: "#4fb8ff", elisa: "#ff5fae", glow: 35 };

let viewer: Viewer | null = null;
let theme: Theme = DEFAULT_THEME;
const ls = new Set<() => void>();
const emit = () => ls.forEach((l) => l());
const sub = (l: () => void) => { ls.add(l); return () => { ls.delete(l); }; };

export function setViewer(v: Viewer | null) {
  if (v === viewer) return;
  viewer = v;
  theme = loadTheme(v);
  emit();
}
export const useViewer = () => useSyncExternalStore(sub, () => viewer, () => viewer);
export const useTheme = () => useSyncExternalStore(sub, () => theme, () => theme);

function loadTheme(v: Viewer | null): Theme {
  if (!v || typeof window === "undefined") return DEFAULT_THEME;
  try { return { ...DEFAULT_THEME, ...JSON.parse(localStorage.getItem(`mae:theme:${v}`) || "{}") }; } catch { return DEFAULT_THEME; }
}
export function saveTheme(t: Theme) {
  theme = t;
  if (viewer) localStorage.setItem(`mae:theme:${viewer}`, JSON.stringify(t));
  emit();
}

/** Writes the viewer's colors to CSS variables. Call from useEffect only. */
export function applyTheme(v: Viewer | null, t: Theme) {
  const r = document.documentElement;
  r.dataset["viewer"] = v ?? "";
  const me = v === "E" ? t.elisa : t.mahan;
  const other = v === "E" ? t.mahan : t.elisa;
  r.style.setProperty("--mahan", t.mahan);
  r.style.setProperty("--elisa", t.elisa);
  r.style.setProperty("--primary", me);
  r.style.setProperty("--ring", me);
  r.style.setProperty("--accent", other);
  r.style.setProperty("--tint-me", `color-mix(in oklch, ${me} ${t.glow}%, transparent)`);
  r.style.setProperty("--tint-other", `color-mix(in oklch, ${other} ${Math.round(t.glow * 0.6)}%, transparent)`);
  r.style.setProperty("--gradient-love", v === "E" ? `linear-gradient(120deg, ${t.elisa}, oklch(0.7 0.2 320), ${t.mahan})` : `linear-gradient(120deg, ${t.mahan}, oklch(0.7 0.2 300), ${t.elisa})`);
  r.style.setProperty("--glow-mahan", `0 0 24px color-mix(in oklch, ${t.mahan} 45%, transparent)`);
  r.style.setProperty("--glow-elisa", `0 0 24px color-mix(in oklch, ${t.elisa} 45%, transparent)`);
}
