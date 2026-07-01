# DomainOps 增强计划

## 一、注册商适配扩展

新增以下 Adapter，实现统一接口 `listDomains()` / `updateNameservers()`：

- **Namecheap** (`src/lib/registrars/namecheap.server.ts`)
  - API：`https://api.namecheap.com/xml.response`（XML 响应，需简易解析）
  - 需要 secrets：`NAMECHEAP_API_USER`、`NAMECHEAP_API_KEY`、`NAMECHEAP_USERNAME`、`NAMECHEAP_CLIENT_IP`
  - 命令：`namecheap.domains.getList`、`namecheap.domains.dns.setCustom`
- **阿里云 (Aliyun / 万网)** (`src/lib/registrars/aliyun.server.ts`)
  - Domain API：`domain.aliyuncs.com` `QueryDomainList` / `SaveSingleTaskForModifyingDNSHost`
  - 需要 `ALIYUN_ACCESS_KEY_ID`、`ALIYUN_ACCESS_KEY_SECRET`
  - 需实现 ACS3-HMAC-SHA256 签名
- **腾讯云 (DNSPod / 域名)** (`src/lib/registrars/tencent.server.ts`)
  - `domain.tencentcloudapi.com` `DescribeDomainNameList` / `ModifyDomainDNSBatch`
  - 需要 `TENCENT_SECRET_ID`、`TENCENT_SECRET_KEY`（TC3-HMAC-SHA256 签名）
- **西部数码 (West.cn)** (`src/lib/registrars/west.server.ts`)
  - `https://api.west.cn/api/v2` 简单 token 认证
  - 需要 `WEST_USERNAME`、`WEST_API_PASSWORD`

在 `/settings` 与 `/domains` 页面显示这些新源；未配置 token 时按钮 disabled。

## 二、解析记录备份 / 恢复 / 差异对比

新页面 **`/backup`**：

- **导出**：选择一个或多个 Zone → 一键导出为 CSV 或 JSON（含 type / name / content / ttl / proxied / priority）。文件通过浏览器下载。
- **恢复**：上传备份文件 → 预览将执行的 `create / update / skip` 动作 → 确认后批量执行。
- **差异对比**：上传备份或选择两个 Zone → 展示 `only in A` / `only in B` / `changed` 三个表格。

Server functions：`exportZoneRecords`、`diffRecords`、`restoreRecords`（复用现有 upsert 逻辑）。

## 三、深色 / 浅色主题切换

- 安装 `next-themes` 并在 `__root.tsx` 用 `ThemeProvider`（`attribute="class"`, `defaultTheme="system"`）包裹。
- 在 `/settings` 顶部新增主题切换（Light / Dark / System 三选一 Toggle Group）。
- 审计所有页面/组件，把 `bg-white`、`text-black` 等硬编码替换为 `bg-background` / `text-foreground` 等语义 token，确保跟随主题。

## 四、CSV 模板下载 + 导入校验 + 错误定位

- 在 `/records` 页面加"下载 CSV 模板"按钮（写死一个含表头 + 2 行示例的字符串，`Blob` 下载）。
- 导入解析流程重写：
  1. 用 Zod schema 校验每一行（`type ∈ CF 支持列表`、`name` 合法域名/@、`content` 按 type 不同校验、`ttl` 数字或 auto、`proxied` bool、`priority` MX 必填）。
  2. 显示"校验结果"表：绿色✔ 通过，红色✘ 带 `行号 + 字段 + 原因`。
  3. 全部通过前禁用"执行"按钮；用户可下载错误清单 CSV。
- 同一流程也用于批量删除的 CSV 匹配。

## 五、Vercel 部署文档

在 `/settings` 页面底部新增可折叠"部署到 Vercel"指南，同时把内容写入项目根 `DEPLOY_VERCEL.md`：

1. Fork / Push 到 GitHub
2. Vercel Import Project，Framework 选 `Other`（TanStack Start 使用 Vite）
3. Build Command：`bun run build`，Output：`.output/public`（TanStack Start 默认）
4. 环境变量清单（逐个列出）：`SESSION_SECRET`、`SITE_PASSWORD`、`CLOUDFLARE_API_TOKEN`、Spaceship / Dynadot / Namecheap / Aliyun / Tencent / West 全套变量
5. 数据库：项目当前无 DB，全部状态存 Cloudflare / 注册商侧；如需持久化，可另接 Neon/Supabase
6. 服务端函数：TanStack `createServerFn` 自动生成 `/_serverFn/*` 路由，Vercel Edge/Node runtime 均可，无需额外配置
7. 首次部署后测试 `/unlock`、`/settings` token 状态

## 技术细节

- 所有注册商 adapter 遵循已有 `RegistrarAdapter` 接口，失败返回 `{ ok:false, error }`，避免抛错。
- 中国注册商签名放在各自 `.server.ts` 内，使用 `node:crypto`；确保 Cloudflare Workers 兼容（`crypto.createHmac` 通过 nodejs_compat 可用）。
- Namecheap 需用户先在其后台加入白名单 IP；文档中说明。
- 恢复/差异使用稳定 key `${type}|${name}|${content}` 匹配。
- Zod 校验错误结构：`{ row, field, message }`，前端表格高亮。
- 主题切换后 shadcn 组件自动适配；对自定义卡片检查一次。

## 交付顺序

1. 主题切换（影响所有后续页面预览）
2. CSV 模板 + 校验
3. 备份 / 恢复 / 差异
4. 注册商 adapters（先 Namecheap，再国内三家 + West）
5. Vercel 部署文档
