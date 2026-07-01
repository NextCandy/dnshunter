import { useSyncExternalStore } from "react";

// Simple cross-page store for the working domain set. Client-only.
const KEY = "domainops.selected";

type Store = { domains: string[] };

function read(): Store {
  if (typeof window === "undefined") return { domains: [] };
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : { domains: [] };
  } catch {
    return { domains: [] };
  }
}

const listeners = new Set<() => void>();

function write(next: Store) {
  if (typeof window !== "undefined") {
    localStorage.setItem(KEY, JSON.stringify(next));
  }
  listeners.forEach((l) => l());
}

export function setDomains(domains: string[]) {
  write({ domains });
}

export function useDomains(): string[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => read().domains,
    () => [],
  );
}
