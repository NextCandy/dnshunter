import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Theme = "light" | "dark" | "system";

type Ctx = { theme: Theme; setTheme: (t: Theme) => void; resolved: "light" | "dark" };

const ThemeCtx = createContext<Ctx | null>(null);
const STORAGE_KEY = "domainops-theme";

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

function readStoredTheme(): Theme {
  const saved = getStorage()?.getItem(STORAGE_KEY);
  return saved === "light" || saved === "dark" || saved === "system" ? saved : "system";
}

function resolveSystem(): "light" | "dark" {
  if (typeof window === "undefined" || !window.matchMedia) return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function apply(theme: Theme) {
  if (typeof document === "undefined") return;
  const r = theme === "system" ? resolveSystem() : theme;
  const root = document.documentElement;
  root.classList.toggle("dark", r === "dark");
  root.style.colorScheme = r;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("system");

  useEffect(() => {
    const saved = readStoredTheme();
    setThemeState(saved);
    apply(saved);
    if (!window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      if (readStoredTheme() === "system") apply("system");
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const setTheme = (t: Theme) => {
    getStorage()?.setItem(STORAGE_KEY, t);
    setThemeState(t);
    apply(t);
  };

  const resolved: "light" | "dark" =
    theme === "system" ? (typeof window === "undefined" ? "light" : resolveSystem()) : theme;

  return <ThemeCtx.Provider value={{ theme, setTheme, resolved }}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  const c = useContext(ThemeCtx);
  if (!c) throw new Error("useTheme must be used inside ThemeProvider");
  return c;
}

// Inline script to run before hydration and avoid a flash of the wrong theme.
export const themeInitScript = `
(function(){try{
  var k='${STORAGE_KEY}';
  var t=localStorage.getItem(k)||'system';
  var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);
  var r=document.documentElement;
  if(d){r.classList.add('dark');}
  r.style.colorScheme=d?'dark':'light';
}catch(e){}})();
`.trim();
