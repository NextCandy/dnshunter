// 域名标准化规则（前后台共用）：
// 1) 去前后空格 2) 转小写 3) 去协议头 4) 去路径/参数/锚点/端口
// 5) 去末尾多余的点 6) 去开头 www.（本项目按根域名管理，手动导入历史上就去 www）
// 注意：本项目未引入 punycode 处理，国际化域名保持原样，避免破坏已有数据。
function cleanDomainText(input: string): string {
  let s = String(input ?? "")
    .trim()
    .toLowerCase();
  if (!s) return "";
  s = s.replace(/^https?:\/\//, "");
  s = s.split("/")[0];
  s = s.split("?")[0];
  s = s.split("#")[0];
  s = s.split(":")[0];
  s = s.replace(/\.+$/, "");
  s = s.replace(/^www\./, "");
  return s;
}

// 严格标准化：无效域名返回 null（用于手动输入/导入的校验）。
export function normalizeDomain(input: string): string | null {
  const s = cleanDomainText(input);
  if (!s) return null;
  if (!/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(s)) return null;
  return s;
}

// 宽松标准化：尽力清洗但绝不返回空丢数据（用于存量数据迁移与去重键）。
export function normalizeDomainLoose(input: string): string {
  const s = cleanDomainText(input);
  return (
    s ||
    String(input ?? "")
      .trim()
      .toLowerCase()
  );
}

export function parseDomainList(text: string): string[] {
  const out = new Set<string>();
  for (const line of text.split(/[\s,;]+/)) {
    const n = normalizeDomain(line);
    if (n) out.add(n);
  }
  return [...out];
}

// 域名主体（后缀前面的部分，不含点）：abc.com -> "abc"，abc.com.cn -> "abc"
export function domainBody(domain: string): string {
  const idx = domain.indexOf(".");
  return idx > 0 ? domain.slice(0, idx) : domain;
}

// 域名后缀（含开头的点）：abc.com -> ".com"，abc.com.cn -> ".com.cn"
export function domainSuffix(domain: string): string {
  const idx = domain.indexOf(".");
  return idx > 0 ? domain.slice(idx) : "";
}
