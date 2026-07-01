import { useEffect, useState } from "react";

// Simple cross-page store for the working domain set. Client-only.
const KEY = "domainops.selected";

const listeners = new Set<() => void>();
const EMPTY: string[] = [];
let memoryDomains: string[] = EMPTY;

// 缓存快照：只有当 localStorage 原始字符串变化时才返回新数组引用，否则返回同一引用。
// 否则 useSyncExternalStore 每次渲染都拿到新数组 → 判定 store 变化 → 无限重渲染（React #185）。
let cachedRaw: string | null = null;
let cachedDomains: string[] = EMPTY;

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

function getSnapshot(): string[] {
  if (typeof window === "undefined") return EMPTY;
  const storage = getStorage();
  if (!storage) return memoryDomains;
  const raw = storage.getItem(KEY);
  if (raw === cachedRaw) return cachedDomains;
  cachedRaw = raw;
  try {
    cachedDomains = raw ? (JSON.parse(raw).domains ?? EMPTY) : EMPTY;
  } catch {
    cachedDomains = EMPTY;
  }
  return cachedDomains;
}

export function setDomains(domains: string[]) {
  memoryDomains = domains;
  const storage = getStorage();
  if (storage) {
    storage.setItem(KEY, JSON.stringify({ domains }));
  }
  listeners.forEach((l) => l());
}

export function useDomains(): string[] {
  const [domains, setDomainsState] = useState<string[]>(EMPTY);

  useEffect(() => {
    const update = () => setDomainsState(getSnapshot());
    update();
    listeners.add(update);
    return () => {
      listeners.delete(update);
    };
  }, []);

  return domains;
}
