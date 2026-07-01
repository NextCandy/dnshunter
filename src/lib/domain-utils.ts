export function normalizeDomain(input: string): string | null {
  if (!input) return null;
  let s = input.trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/^https?:\/\//, "");
  s = s.split("/")[0];
  s = s.split("?")[0];
  s = s.replace(/\.$/, "");
  s = s.replace(/^www\./, "");
  if (!/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(s)) return null;
  return s;
}

export function parseDomainList(text: string): string[] {
  const out = new Set<string>();
  for (const line of text.split(/[\s,;]+/)) {
    const n = normalizeDomain(line);
    if (n) out.add(n);
  }
  return [...out];
}
