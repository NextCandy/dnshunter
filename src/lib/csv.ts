import { z } from "zod";

export const CF_TYPES = ["A", "AAAA", "CNAME", "TXT", "MX", "NS", "CAA", "SRV"] as const;

export type ValidatedRecord = {
  domain: string;
  type: string;
  name: string;
  content: string;
  ttl: number;
  proxied: boolean;
  priority?: number;
};

export type CsvError = { row: number; field: string; message: string };

export type CsvParseResult = {
  headers: string[];
  valid: ValidatedRecord[];
  errors: CsvError[];
  totalRows: number;
};

const domainRe = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;
const ipv4Re = /^(\d{1,3}\.){3}\d{1,3}$/;
const ipv6Re = /^[0-9a-f:]+$/i;
const hostnameRe = /^([a-z0-9_*]([a-z0-9-_]*[a-z0-9])?)(\.[a-z0-9_]([a-z0-9-_]*[a-z0-9])?)*\.?$/i;

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') inQ = false;
      else cur += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ",") {
        out.push(cur);
        cur = "";
      } else cur += c;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

const REQUIRED = ["domain", "type", "name", "content"] as const;

const rowSchema = z.object({
  domain: z.string().regex(domainRe, "无效域名"),
  type: z.enum(CF_TYPES, { message: `type 必须是 ${CF_TYPES.join("/")}` }),
  name: z.string().min(1, "name 不能为空"),
  content: z.string().min(1, "content 不能为空"),
  ttl: z
    .number()
    .int()
    .refine((v) => v === 1 || (v >= 60 && v <= 86400), "ttl 必须为 1(auto) 或 60-86400"),
  proxied: z.boolean(),
  priority: z.number().int().min(0).max(65535).optional(),
});

export function validateContent(type: string, content: string): string | null {
  if (type === "A" && !ipv4Re.test(content)) return "A 记录 content 必须是 IPv4 地址";
  if (type === "AAAA" && (!ipv6Re.test(content) || !content.includes(":")))
    return "AAAA 记录 content 必须是 IPv6 地址";
  if (type === "CNAME" && !hostnameRe.test(content)) return "CNAME content 必须是主机名";
  if (type === "NS" && !hostnameRe.test(content)) return "NS content 必须是主机名";
  if (type === "MX" && !hostnameRe.test(content)) return "MX content 必须是主机名";
  return null;
}

export function parseAndValidateCsv(text: string): CsvParseResult {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith("#"));
  const errors: CsvError[] = [];
  const valid: ValidatedRecord[] = [];
  if (lines.length === 0) return { headers: [], valid, errors, totalRows: 0 };

  const headers = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  for (const r of REQUIRED) {
    if (!headers.includes(r)) errors.push({ row: 1, field: r, message: `表头缺少列 "${r}"` });
  }
  if (errors.length) return { headers, valid, errors, totalRows: lines.length - 1 };

  for (let i = 1; i < lines.length; i++) {
    const rowNum = i + 1;
    const cols = splitCsvLine(lines[i]);
    const raw: any = {};
    headers.forEach((h, idx) => (raw[h] = cols[idx] ?? ""));
    const parsed = {
      domain: (raw.domain || "").toLowerCase().trim(),
      type: (raw.type || "").toUpperCase().trim(),
      name: (raw.name || "@").trim(),
      content: (raw.content || "").trim(),
      ttl:
        raw.ttl == null || raw.ttl === "" || String(raw.ttl).toLowerCase() === "auto"
          ? 1
          : Number(raw.ttl),
      proxied: ["true", "1", "yes", "y"].includes(String(raw.proxied ?? "").toLowerCase()),
      priority: raw.priority == null || raw.priority === "" ? undefined : Number(raw.priority),
    };
    const check = rowSchema.safeParse(parsed);
    if (!check.success) {
      for (const issue of check.error.issues) {
        errors.push({
          row: rowNum,
          field: String(issue.path[0] ?? "row"),
          message: issue.message,
        });
      }
      continue;
    }
    if (parsed.type === "MX" && parsed.priority === undefined) {
      errors.push({ row: rowNum, field: "priority", message: "MX 记录必须提供 priority" });
      continue;
    }
    const contentErr = validateContent(parsed.type, parsed.content);
    if (contentErr) {
      errors.push({ row: rowNum, field: "content", message: contentErr });
      continue;
    }
    valid.push(check.data as ValidatedRecord);
  }
  return { headers, valid, errors, totalRows: lines.length - 1 };
}

export const CSV_TEMPLATE = `domain,type,name,content,ttl,proxied,priority
# ttl=1 表示 Auto；proxied 仅对 A/AAAA/CNAME 生效；MX 需填 priority
example.com,A,@,1.2.3.4,1,true,
example.com,CNAME,www,example.com,1,true,
example.com,MX,@,mail.example.com,3600,false,10
example.com,TXT,@,"v=spf1 include:_spf.google.com ~all",3600,false,
`;

export function toCsv(
  records: (ValidatedRecord | (Omit<ValidatedRecord, "domain"> & { domain?: string }))[],
): string {
  const header = "domain,type,name,content,ttl,proxied,priority";
  const rows = records.map((r) => {
    const esc = (v: any) => {
      const s = v == null ? "" : String(v);
      return /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    return [
      esc((r as any).domain ?? ""),
      esc(r.type),
      esc(r.name),
      esc(r.content),
      esc(r.ttl),
      esc(r.proxied),
      esc(r.priority ?? ""),
    ].join(",");
  });
  return [header, ...rows].join("\n");
}

export function downloadBlob(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
