import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { lookupDomainDns, type DomainDnsLookup } from "@/lib/dns-lookup.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Globe2, Loader2, RefreshCw, Copy, SlidersHorizontal, ExternalLink } from "lucide-react";

const DNS_TYPES = ["A", "AAAA", "CNAME", "MX", "TXT", "NS"] as const;

/**
 * 通用 DNS 查看弹窗：实时查询域名的 A/AAAA/CNAME/MX/TXT/NS 记录 + NS 托管商，
 * 并按托管情况给出「站内修改」或「外部管理台」入口。域名列表页与手动域名页共用。
 */
export function DnsDialog({
  domain,
  onClose,
  onEditInCloudflare,
}: {
  domain: string | null;
  onClose: () => void;
  onEditInCloudflare: (domain: string) => void;
}) {
  const lookupFn = useServerFn(lookupDomainDns);
  const q = useQuery({
    queryKey: ["dns-lookup", domain],
    queryFn: () => lookupFn({ data: { domain: domain! } }),
    enabled: !!domain,
    staleTime: 60_000,
  });
  const data = q.data as DomainDnsLookup | undefined;

  const copyAll = async () => {
    if (!data) return;
    const lines: string[] = [];
    for (const type of DNS_TYPES) {
      for (const v of data.records[type]) lines.push(`${type}\t${v}`);
    }
    if (lines.length === 0) return;
    await navigator.clipboard.writeText(lines.join("\n"));
    toast.success("已复制全部 DNS 记录");
  };

  return (
    <Dialog open={!!domain} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-mono text-base">
            <Globe2 className="size-4 text-primary" />
            {domain}
          </DialogTitle>
        </DialogHeader>

        {q.isPending ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> 正在实时查询 DNS 记录…
          </div>
        ) : q.isError ? (
          <div className="py-10 text-center text-sm text-destructive">
            查询失败：{(q.error as Error).message}
          </div>
        ) : data ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-muted/30 p-3 text-sm">
              {data.nsStatus === "cloudflare" ? (
                <>
                  <span className="signal signal-success" />
                  <span>
                    NS 托管：<span className="font-medium text-success">Cloudflare</span>
                  </span>
                </>
              ) : data.nsProvider ? (
                <>
                  <span className="signal signal-warning" />
                  <span>
                    NS 托管：<span className="font-medium">{data.nsProvider}</span>
                  </span>
                </>
              ) : (
                <>
                  <span className="signal signal-muted" />
                  <span className="text-muted-foreground">未识别 NS 托管商</span>
                </>
              )}
              {data.nameservers.length > 0 && (
                <span className="ml-auto max-w-[60%] truncate font-mono text-xs text-muted-foreground">
                  {data.nameservers.join(" · ")}
                </span>
              )}
            </div>

            <div className="flex items-center justify-end gap-1">
              <Button variant="ghost" size="sm" onClick={() => q.refetch()} disabled={q.isFetching}>
                <RefreshCw className={"mr-1 size-3.5 " + (q.isFetching ? "animate-spin" : "")} />
                重新查询
              </Button>
              {data.recordCount > 0 && (
                <Button variant="ghost" size="sm" onClick={copyAll}>
                  <Copy className="mr-1 size-3.5" />
                  复制全部
                </Button>
              )}
            </div>

            {data.recordCount === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                {data.error ?? "未查询到 DNS 记录"}
              </div>
            ) : (
              <div className="max-h-[46vh] space-y-3 overflow-auto pr-1">
                {DNS_TYPES.map((type) => {
                  const list = data.records[type];
                  if (!list || list.length === 0) return null;
                  return (
                    <div key={type} className="overflow-hidden rounded-lg border border-border/60">
                      <div className="flex items-center gap-2 border-b border-border/60 bg-muted/30 px-3 py-1.5">
                        <span className="font-mono text-xs font-semibold">{type}</span>
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {list.length}
                        </span>
                      </div>
                      <div className="divide-y divide-border/40">
                        {list.map((v, i) => (
                          <div
                            key={i}
                            className="group flex items-center justify-between gap-2 px-3 py-1.5"
                          >
                            <span className="break-all font-mono text-xs">{v}</span>
                            <button
                              type="button"
                              onClick={async () => {
                                await navigator.clipboard.writeText(v);
                                toast.success("已复制");
                              }}
                              className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
                              aria-label="复制这条记录"
                            >
                              <Copy className="size-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-3">
              <span className="max-w-xs text-xs text-muted-foreground">
                {data.nsStatus === "cloudflare"
                  ? "该域名托管在 Cloudflare，可在站内直接修改解析。"
                  : "解析托管在外部，请到对应管理台修改。"}
              </span>
              {data.nsStatus === "cloudflare" ? (
                <Button
                  size="sm"
                  onClick={() => {
                    if (domain) onEditInCloudflare(domain);
                  }}
                >
                  <SlidersHorizontal className="mr-1 size-3.5" />
                  站内修改解析
                </Button>
              ) : data.managerUrl ? (
                <Button asChild size="sm">
                  <a href={data.managerUrl} target="_blank" rel="noreferrer">
                    去 {data.nsProvider} 管理台
                    <ExternalLink className="ml-1 size-3.5" />
                  </a>
                </Button>
              ) : (
                <span className="text-xs text-muted-foreground">未识别托管商，无修改入口</span>
              )}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
