
# 批量域名管理工具（Cloudflare + 多注册商）

一个单用户的 Web 控制台。所有 API token 保存在服务端（Lovable Cloud 密钥），前端只调用自家的 TanStack Start server functions，永远不把 token 暴露到浏览器。

## 功能范围

1. **域名来源（去重合并）**
   - 手动粘贴：文本框，一行一个域名，自动去掉 `http(s)://`、路径、大小写、尾点。
   - 注册商拉取：Spaceship、Cloudflare Registrar、Dynadot（用已保存的 token 分别拉取）。
   - 合并列表：以根域名为 key 去重，标注来源（可能同时来自"手动 + Spaceship"）。

2. **批量绑定到 Cloudflare**
   - 为每个域名在 CF 创建 Zone（可选 account 选择、free plan、Full 模式），返回 CF 分配的 NS。
   - 可选"自动改 NS"：调用对应注册商 API 把 NS 改为 CF 的两个地址（Spaceship / Dynadot / Cloudflare Registrar 支持，其他标记为"需手动"并展示 NS 供复制）。
   - 可选"触发激活检查"：调用 CF `activation_check`，轮询 zone 状态直到 active 或超时。
   - 结果表：每行显示 域名 / Zone 创建 / NS 更新 / 激活 三个状态 + 错误信息。

3. **批量添加解析记录**
   - 模式 A · 模板：定义一组记录（type/name/content/ttl/proxied），勾选目标域名，一键应用到所有选中 zone。
   - 模式 B · CSV 导入：`domain,type,name,content,ttl,proxied` 逐行执行。
   - 支持 upsert 选项（若同 name+type 已存在则更新，否则新建）。

4. **批量删除解析记录**
   - 按过滤条件删除：选中域名 + 按 type / name 前后缀 / content 匹配。
   - 预览命中记录 → 二次确认 → 执行。
   - 也支持通过 CSV（同上格式）精确删除。

5. **实时进度与日志**
   - 每个批量操作用一个"任务卡片"显示进度条 + 逐行结果，失败可单独重试。

## 页面结构

```text
/                     仪表盘：token 状态、账户概况、快捷入口
/settings/tokens      配置 Cloudflare / Spaceship / Dynadot token（写入服务端密钥）
/domains              域名总表：粘贴 + 拉取 + 去重合并 + 多选
/bind                 批量绑定到 Cloudflare（Zone / NS / 激活）
/records              批量解析记录：添加（模板/CSV）与删除（过滤/CSV）
```

顶部导航 + 侧栏。深色简洁风格，shadcn/ui 组件（Table、Dialog、Progress、Tabs、Textarea、Card）。

## 技术方案（技术细节）

- **框架**：TanStack Start（现有模板），路由文件全部走 `src/routes/*`。
- **Token 存储**：`secrets--add_secret` 保存 `CLOUDFLARE_API_TOKEN`、`SPACESHIP_API_KEY`、`SPACESHIP_API_SECRET`、`DYNADOT_API_KEY`。用户在 `/settings/tokens` 触发 add_secret 表单填写。
- **访问控制（单用户）**：额外加一个共享密码门（`SITE_PASSWORD` + `SESSION_SECRET`，encrypted session cookie），保护所有页面与 server functions，避免公网暴露。
- **Server functions**（`src/lib/*.functions.ts`，全部带 session 校验中间件）：
  - `listRegistrarDomains({registrar})` → 调注册商 API。
  - `bindDomainsToCloudflare({domains, accountId, updateNS, activationCheck})` → 逐个执行，返回结果数组；使用 `ReadableStream` + server route（`/api/bulk-bind`）分块推送进度更能友好，但 v1 可先同步返回，前端按批调用（例如每次 5 个）。
  - `bulkAddRecords({zoneIds|domains, records[], upsert})`
  - `bulkDeleteRecords({domains, filter})` + `previewDeleteRecords`（返回命中列表）
- **注册商适配层**：`src/lib/registrars/{cloudflare,spaceship,dynadot}.server.ts`，统一接口 `listDomains()`、`updateNameservers(domain, ns[])`。
- **CF 调用**：`https://api.cloudflare.com/client/v4`，POST `/zones`（创建），PATCH `/zones/:id`（激活检查），`/zones/:id/dns_records`（增删查）。
- **速率与错误**：每个批量任务串行 + 每次调用捕获错误写入返回结果；对 429 简单退避 1s 重试一次。
- **无数据库**：不需要 Lovable Cloud DB；操作日志仅前端内存，用户可导出 CSV。

## 不做（可后续再加）
- 定时任务 / 历史审计
- 多用户 & 角色
- 更多注册商（Namecheap、GoDaddy…）
- WHOIS / 到期提醒

第一版目标是"能把一批域名快速塞进 Cloudflare 并统一管理 DNS"。
