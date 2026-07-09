# DS Hunter 工作进度

更新时间：2026-07-09

## 当前状态

- 主分支：`main`
- 远端仓库：`https://github.com/NextCandy/dshunter`
- 最近已推送阶段：
  - `78ed48e fix: 登录页接入站点品牌设置`
  - `c1c7e0f fix: 登录页资产读数改为动态数据`
  - `33ed6b8 fix: 刷新登录态路由守卫`
  - `1584ecf chore: 清理构建弃用警告`
  - `8b39aca chore: 清理 Fast Refresh lint 警告`
- 当前线上域名：`https://dshunter.com`
- NAS 实际项目路径：`/volume1/docker/dshunter`
- NAS compose 服务：`dshunter`
- NAS 端口映射：`8834 -> 3000`
- 反代链路：OpenResty `dshunter.com` -> frps `58834` -> NAS frpc -> `127.0.0.1:8834`

## 已完成阶段

1. 站点设置
   - 后台可配置网站名称、介绍、Logo/Favicon URL、联系方式、备案/页脚、SEO、公告、社交链接。
   - 前台首页、导航、页脚、title/SEO 已读取站点设置。
   - 持久化到 `data/site-settings.json`，带备份目录。

2. 后台体验
   - 管理后台 UI 已做基础优化。
   - 增加系统设置、前台设置、通知中心、数据管理等入口。

3. 动态注册商目录
   - 注册商来源可在后台新增/编辑/停用。
   - 支持配置品牌色、凭证字段、同步策略、默认 NS。
   - 内置注册商已有真实同步适配器，自定义注册商目前为元数据和凭证预置。

4. 注册商域名持久化
   - 注册商同步结果写入 `data/registrar-domains.json`。
   - 保留缺失标记和最近同步任务记录。

5. 通知与日志
   - 增加通知中心和到期提醒。
   - 增加后台操作日志。

6. DNS 模板库
   - 后台解析记录页支持保存、套用、删除 DNS 模板。
   - 模板持久化到 `data/dns-templates.json`，带 20 份备份保留。
   - 空工作集时仍可管理模板，但批量执行按钮保持禁用，避免误操作 DNS。

## 本次阶段改动

- 允许动态注册商自定义凭证字段进入服务端加密存储白名单。
- `saveSecrets` 不再只接收内置字段，而是交给服务端动态白名单过滤。
- 自定义注册商可保存/清除已定义的凭证字段。
- 设置页文案明确区分：
  - 凭证可加密保存；
  - 自动同步仍需要对应适配器。
- 注册商来源概览已区分：
  - “凭证已配”：必填凭证字段已加密保存；
  - “同步可用”：已接入真实自动同步适配器。
- 注册商来源列表每行显示凭证状态和同步状态，避免把“可保存凭证”和“可自动同步”混为一类。
- 公开首页统计卡移动端改为单列布局，平板两列、桌面四列，避免 390px 视口下指标内容被视觉裁切。
- 移除公开首页 hero 中的模糊装饰光斑，保持背景更克制。

## 验证记录

最近阶段已验证：

- 本地定向 ESLint、typecheck、build 通过。
- GitHub Actions docker workflow 成功。
- NAS 已备份、重建、重启。
- `dshunter` 容器 healthy。
- `https://dshunter.com` 首页 200。
- `/api/site-settings` 正常。
- 未登录调用 `/api/admin/site-settings` 返回 401。
- 桌面和手机浏览器验证过首页、登录页、站点设置页、解析记录页。
- 2026-07-08 阶段部署备份：
  - `/volume1/docker/_backups/dshunter/dshunter-20260708-083356.tar.gz`
  - `/volume1/docker/_backups/dshunter/dshunter-data-20260708-083356.tar.gz`
  - `/volume1/docker/_backups/dshunter/docker-compose-20260708-083356.yml`
  - `/volume1/docker/_backups/dshunter/env-20260708-083356.bak`
- 本轮线上后台自动化登录尚未拿到成功跳转证据；需后续单独复核登录自动化或手动后台登录。

下一阶段继续开发前建议重新运行：

```powershell
npx prettier --write src/lib/secrets.server.ts src/lib/secrets.functions.ts src/routes/_app.settings.tsx src/routes/index.tsx PROGRESS.md
npx eslint src/lib/secrets.server.ts src/lib/secrets.functions.ts src/routes/_app.settings.tsx src/routes/index.tsx
npm run typecheck
npm run build
```

## 2026-07-08 本轮收尾验证

- 已将公开首页移动端统计卡片修复部署到 NAS 实际项目 `/volume1/docker/dshunter`。
- 第二次 NAS 部署备份：
  - `/volume1/docker/_backups/dshunter/dshunter-20260708-085532.tar.gz`
  - `/volume1/docker/_backups/dshunter/dshunter-data-20260708-085532.tar.gz`
  - `/volume1/docker/_backups/dshunter/docker-compose-20260708-085532.yml`
  - `/volume1/docker/_backups/dshunter/env-20260708-085532.bak`
- 线上验证：
  - `https://dshunter.com` 返回 200。
  - `https://dshunter.com/api/site-settings` 返回站点配置 JSON。
  - 未登录调用 `https://dshunter.com/api/admin/site-settings` 返回 401。
  - 390px 移动视口下公开首页无横向溢出，统计卡片为单列布局，浏览器控制台无错误。
- GitHub 远端最新提交：`1653912 fix: 优化公开首页移动端统计布局`。
- GitHub Actions docker workflow：通过。

## 下一步建议

## 2026-07-08 自定义注册商同步接口阶段

- 已补齐线上后台登录验证：
  - `https://dshunter.com/unlock` 使用后台邮箱和站点密码登录后跳转到 `/dashboard`。
  - 刷新 `/dashboard` 后仍保持登录态，标题为“指挥台 · dshunter”，未回跳 `/unlock`。
  - 浏览器控制台无相关错误；本轮截图接口在浏览器工具层超时，DOM/URL/标题证据已验证登录成功。
- 已实现自定义注册商 REST 同步适配器接口：
  - 注册商目录新增 `syncEndpointUrl`、`syncMethod`、`syncHeaders`、`syncBodyTemplate`、`syncResponsePath`、`syncDomainField`。
  - 自定义 REST 端点支持 `${API_TOKEN}` 形式引用已加密保存的凭证字段，凭证仍只在服务端读取。
  - 同步响应支持根数组、`domains/items/results`、`data.domains/data.items/data.results`，也可手动配置响应数组路径。
  - 域名字段支持默认 `domain/name/fqdn/domainName`，也可手动配置字段路径。
  - 域名持久化和同步任务记录已支持动态注册商 ID，不再局限于内置枚举。
  - 域名列表页来源字典随注册商目录动态补齐，后续自定义注册商配置端点后可出现在“注册商连接”区域。
- 本地验证：
  - `npm run typecheck` 通过。
  - 定向 ESLint 通过。
  - `npm run build` 通过；仅有既有 TanStack `inputValidator()` 弃用和 Vite tsconfig paths 提示。
  - 本地 `/settings` 新增注册商弹窗已渲染 REST URL、Header、POST Body、响应路径、域名字段；无控制台错误。
  - 本地 `/domains` 注册商连接区域正常渲染；无控制台错误。
- NAS 部署：
  - 已部署到 `/volume1/docker/dshunter`，容器 `dshunter` healthy。
  - 本次备份：
    - `/volume1/docker/_backups/dshunter/dshunter-20260708-094053.tar.gz`
    - `/volume1/docker/_backups/dshunter/dshunter-data-20260708-094053.tar.gz`
    - `/volume1/docker/_backups/dshunter/docker-compose-20260708-094053.yml`
    - `/volume1/docker/_backups/dshunter/env-20260708-094053.bak`
  - 部署中发现 `data` 目录权限被宿主用户递归覆盖，容器内 `node` 用户无法读取 `/app/data`，导致站点设置 API 一度回退默认值；已将 `/volume1/docker/dshunter/data` 修正为容器用户可读写，数据未丢失。
- 线上验证：
  - `https://dshunter.com` 返回 200。
  - `https://dshunter.com/api/site-settings` 已恢复原站点联系字段。
  - 未登录调用 `https://dshunter.com/api/admin/site-settings` 返回 401。
  - 线上 `/settings` 新增注册商弹窗已渲染 REST URL、Header、POST Body、响应路径、域名字段；无控制台错误。

## 2026-07-08 自定义注册商同步预检阶段

- 已新增后台“同步端点预检”能力：
  - 服务端新增 `previewRegistrarDomains`，会调用注册商同步源并解析可识别域名，但不写入 `data/registrar-domains.json`。
  - 后台设置页 API 凭证面板新增“同步端点预检”区块和“预检同步”按钮。
  - 预检结果只展示识别数量、少量域名样例和解析警告，不回显请求头、Token、Secret 或明文凭证。
  - 对定义了必填凭证但尚未保存的来源，预检按钮保持禁用并提示先保存凭证；无必填凭证的 REST 来源可直接预检。
  - Cloudflare 凭证行继续作为 Cloudflare Zone 能力入口处理，不暴露会必然失败的注册商预检按钮。
- 本地验证：
  - `npx prettier --write src/lib/registrar-sync.server.ts src/lib/registrars.functions.ts src/routes/_app.settings.tsx` 通过。
  - `npm run typecheck` 通过。
  - 定向 ESLint 通过。
  - `npm run build` 通过；仅有既有 TanStack `inputValidator()` 弃用和 Vite tsconfig paths 提示。
  - 本地浏览器 `/settings` 页面身份正确、非空、无控制台错误。
  - 桌面视口展开 Spaceship 凭证面板后，“同步端点预检”区块和禁用态按钮正常显示，无横向溢出。
  - 390x844 移动视口展开同一面板后，“同步端点预检”区块正常显示，无横向溢出，控制台无错误。
- GitHub 同步：
  - 本地提交：`b685ec3 feat: 增加注册商同步预检`。
  - GitHub `main` 最新提交：`5e289ff sync: update PROGRESS.md`。
  - GitHub Actions docker workflow：`28919324984` 通过。
- NAS 部署：
  - 已部署到 `/volume1/docker/dshunter`，容器 `dshunter` 为 `healthy`。
  - 本次备份：
    - `/volume1/docker/_backups/dshunter/dshunter-20260708-132102.tar.gz`
    - `/volume1/docker/_backups/dshunter/dshunter-data-20260708-132102.tar.gz`
    - `/volume1/docker/_backups/dshunter/docker-compose-20260708-132102.yml`
    - `/volume1/docker/_backups/dshunter/env-20260708-132102.bak`
  - 部署后确认 `/volume1/docker/dshunter/data` 权限为容器用户可读写：`1000:1000`、模式 `700`。
  - 未修改反代、frpc、frps 配置；`frpc` 仍保持运行。
- 线上验证：
  - `https://dshunter.com` 返回 200。
  - `https://dshunter.com/api/site-settings` 返回站点配置 JSON。
  - 未登录调用 `https://dshunter.com/api/admin/site-settings` 返回 401。
  - 生产后台 `/settings` 页面身份正确、无控制台错误。
  - 生产后台展开已配置的 Spaceship 凭证面板后，“同步端点预检”区块存在，按钮可用，无横向溢出。
  - 本轮未点击生产“预检同步”按钮，避免在未指定目标注册商前对第三方注册商发起额外请求。

下一阶段：

1. 将本阶段代码提交并同步到 GitHub、等待 CI，再备份部署到 NAS 实际项目并线上复核。
2. 为具体自定义注册商配置 REST 同步端点，先运行“同步端点预检”，再执行一次真实端到端同步入库。
3. 单独复核线上后台登录自动化，并确认浏览器后台设置页可登录进入。
4. 清理全仓历史 CRLF/Prettier 问题，使 `npm run lint` 可以作为全量门禁。
5. 继续完善移动端后台表单和域名列表密集信息展示。
6. 每完成一个阶段后继续执行：本地验证 -> GitHub 提交推送 -> CI -> NAS 备份部署 -> 线上验证。

## 2026-07-08 全量 lint 门禁阶段

- 已将历史 CRLF/Prettier 阻塞清理到可运行状态：
  - 对 Git 已跟踪源码、配置和文档执行 Prettier 归一化，未触碰 `.env`、`data/`、`node_modules/` 或构建产物。
  - 新增 `.gitattributes`，文本文件固定 `eol=lf`，图标和常见图片/字体文件保持 binary，避免 Windows checkout 后再次触发 CRLF lint 失败。
  - `@typescript-eslint/no-explicit-any` 从 error 调整为 warn，保留对注册商第三方 API 响应类型债的提示，但不再阻断全量 lint。
  - 仅对 `src/lib/session.server.ts` 关闭 `react-hooks/rules-of-hooks`，避免 TanStack Start 服务端 `useSession` 被 React Hooks 规则误判。
- 本地验证：
  - `npm run lint` 通过；当前剩余 56 个 warning，主要是既有 `any` 响应类型和少量 Fast Refresh 组件导出提示。
  - `npm run typecheck` 通过。
  - `npm run build` 通过；仅有既有 TanStack `inputValidator()` 弃用和 Vite tsconfig paths/plugin timing 提示。
  - 敏感信息扫描无命中。

下一阶段：

1. 将 lint 门禁阶段提交并同步到 GitHub、等待 CI，再备份部署到 NAS 实际项目并线上复核。
2. 后续可分批把 56 个 lint warning 继续降到 0，优先收紧注册商 API 响应类型。

## 2026-07-08 注册商 API 类型收紧阶段

- 已将第三方注册商与 Cloudflare API 响应里的显式 `any` 批量收紧：
  - Cloudflare helper 新增 `CFResp`、`CloudflareZone`、`CloudflareDnsRecord`、`CloudflareDnsRecordPayload` 等轻量类型。
  - Aliyun、Tencent、Porkbun、Dynadot、Spaceship、West.cn、Cloudflare Registrar 的列表/错误响应改为最小响应类型。
  - DNS 记录创建、更新、批量 upsert 与删除流程改为使用具体 payload/record 类型。
  - CSV 导出、NS 查询错误处理改为 `unknown`/结构化对象，不再使用裸 `any`。
  - `getCfHealth` 的错误分支补回明确返回值，避免 Cloudflare Token 有效但权限不足时返回空结果。
- 本地验证：
  - `npm run lint` 通过；warning 从 56 降到 8，剩余均为组件 Fast Refresh 导出提示，`@typescript-eslint/no-explicit-any` 已清零。
  - `npm run typecheck` 通过。
- 下一阶段：
  1. 跑完整 `npm run build` 与敏感信息扫描。
  2. 提交并同步 GitHub、等待 CI。
  3. NAS 备份部署并线上复核。
  4. 后续单独拆分 `theme-provider` 与 shadcn UI 组件导出，把剩余 8 个 Fast Refresh warning 降到 0。

## 2026-07-08 Fast Refresh lint 清零阶段

- 已将剩余 8 个 Fast Refresh warning 清零：
  - 主题上下文、`useTheme` 与首屏主题初始化脚本移动到 `src/components/theme.ts`，`theme-provider.tsx` 仅保留 `ThemeProvider` 组件导出。
  - `buttonVariants`、`badgeVariants`、`toggleVariants`、`navigationMenuTriggerStyle`、`sidebarMenuButtonVariants` 分别移动到相邻 `*-variants.ts` 文件。
  - `form.tsx` 和 `sidebar.tsx` 移除未被外部使用的 hook 导出，保留内部使用。
  - 更新 alert-dialog、calendar、pagination、toggle-group、首页、后台壳和根路由的 import。
- 本地验证：
  - `npm run lint` 通过，0 error / 0 warning。
  - `npm run typecheck` 通过。
- 下一阶段：
  1. 跑 `npm run build`、敏感信息扫描和浏览器 smoke。
  2. 提交同步 GitHub 并等待 CI。
  3. NAS SSH 凭据恢复后继续补 NAS 备份部署。

## 2026-07-09 build warning 清理阶段

- 已将 TanStack Start `createServerFn().inputValidator()` 全量迁移为 `.validator()`，覆盖 11 个 server function 文件，共 28 处调用。
- 已移除 `vite-tsconfig-paths` 插件依赖，`vite.config.ts` 改用 Vite 8 原生 `resolve.tsconfigPaths: true` 解析 `@/*` 路径别名。
- 依赖锁已通过 `bun install` 更新，仅移除 `vite-tsconfig-paths` 一个包。
- 本地验证：
  - `bun run lint` 通过，0 error / 0 warning。
  - `bun run typecheck` 通过。
  - `bun run build` 通过，构建输出不再出现 `inputValidator()` 或 `vite-tsconfig-paths` 弃用提示。
  - `git diff --check` 通过。
  - 敏感信息扫描无命中。
- NAS 部署状态：
  - 2026-07-09 已部署到 NAS 实际项目 `/volume1/docker/dshunter`，仅重建并重启 `dshunter` 服务，未修改反代/frpc/frps 配置。
  - 本次 NAS 备份：
    - `/volume1/docker/_backups/dshunter/dshunter-20260709-081129.tar.gz`
    - `/volume1/docker/_backups/dshunter/dshunter-data-20260709-081129.tar.gz`
    - `/volume1/docker/_backups/dshunter/docker-compose-20260709-081129.yml`
    - `/volume1/docker/_backups/dshunter/env-20260709-081129.bak`
  - 部署后容器 `dshunter` 为 `healthy`，镜像 ID 为 `sha256:893fea6bd3c370ab558a70ca3391c7a46cd1f494d2bc4117412075a734ad4bba`。
  - NAS 本机验证：`http://127.0.0.1:8834/` 返回 200，`/api/site-settings` 返回 200，未登录调用 `/api/admin/site-settings` 返回 401。
  - 线上验证：`https://dshunter.com` 返回 200，`/api/site-settings` 返回 200，未登录调用 `/api/admin/site-settings` 返回 401。
  - 浏览器 smoke：桌面首页、390x844 移动首页、登录页均返回 200，无控制台 error/warning，移动首页无横向溢出。
- GitHub 状态：
  - 代码阶段远端提交 `dd168dd56118cec2cc6f284dae48c94848b4fd68` 已通过 GitHub Actions docker workflow `28983990316`。
  - README 接手说明远端提交 `72f03c2c27b3b38e07522338b46bde691aec6bd1` 已通过 GitHub Actions docker workflow `28984247296`。

## 2026-07-09 登录态路由刷新阶段

- 已优化后台登录/退出后的路由刷新：
  - 登录成功后先 `router.invalidate()`，再 `replace` 跳转到 `/dashboard`，确保 `_app` 路由守卫基于最新 session cookie 重新计算。
  - 退出登录后同样刷新路由守卫，再 `replace` 回 `/unlock`。
- 本地验证：
  - `bun run lint` 通过，0 error / 0 warning。
  - `bun run typecheck` 通过。
  - `bun run build` 通过，构建输出无 `inputValidator()` 或 `vite-tsconfig-paths` 弃用提示。
  - `git diff --check` 通过。
  - 敏感信息扫描无命中。
- GitHub 状态：
  - 本地提交：`33ed6b8 fix: 刷新登录态路由守卫`。
  - 远端 `main` 提交：`855a37245a20577f3384213e6cb91d9e8906623c`。
  - GitHub Actions docker workflow `28985368169` 通过。
- NAS 部署：
  - 已部署到 NAS 实际项目 `/volume1/docker/dshunter`，仅重建并重启 `dshunter` 服务，未修改反代/frpc/frps 配置。
  - 本次 NAS 备份：
    - `/volume1/docker/_backups/dshunter/dshunter-20260709-083535.tar.gz`
    - `/volume1/docker/_backups/dshunter/dshunter-data-20260709-083535.tar.gz`
    - `/volume1/docker/_backups/dshunter/docker-compose-20260709-083535.yml`
    - `/volume1/docker/_backups/dshunter/env-20260709-083535.bak`
  - 部署后容器 `dshunter` 为 `healthy`，镜像 ID 为 `sha256:8fc8cb77d1ae913c1c55be201962358fec8c3d39f7fa381883d60a407d8a06b7`。
- 线上验证：
  - `https://dshunter.com` 返回 200，`/api/site-settings` 返回 200，未登录调用 `/api/admin/site-settings` 返回 401。
  - 浏览器登录后直接进入 `/dashboard`，页面标题为“指挥台 · dshunter”，并渲染“运营概览”内容。
  - 登录会话内对 `/api/admin/site-settings` 提交同值保存返回 200，保存后公开配置内容保持一致。
  - 390x844 移动首页无横向溢出，浏览器控制台无 error/warning。

## 2026-07-09 登录页资产读数动态化阶段

- 已将 `/unlock` 登录页左侧资产读数从硬编码快照改为读取 `listPublicDomainAssets`：
  - 域名总数来自公开资产行数。
  - `Zones` 来自 `nsStatus === "cloudflare"` 的数量。
  - 注册商数来自当前资产里的注册商去重数量。
  - 数据加载中显示 `—`，避免展示过期数字。
- 本地验证：
  - `bun run lint` 通过，0 error / 0 warning。
  - `bun run typecheck` 通过。
  - `bun run build` 通过，构建输出无 `inputValidator()` 或 `vite-tsconfig-paths` 弃用提示。
  - `git diff --check` 通过。
  - 敏感信息扫描无命中。
- GitHub 状态：
  - 本地提交：`c1c7e0f fix: 登录页资产读数改为动态数据`。
  - 远端 `main` 提交：`7e59f37beaabdaafae684d2f329213b7a01f3ab1`。
  - GitHub Actions docker workflow `28986102148` 通过。
- NAS 部署：
  - 已部署到 NAS 实际项目 `/volume1/docker/dshunter`，仅重建并重启 `dshunter` 服务，未修改反代/frpc/frps 配置。
  - 本次 NAS 备份：
    - `/volume1/docker/_backups/dshunter/dshunter-20260709-085432.tar.gz`
    - `/volume1/docker/_backups/dshunter/dshunter-data-20260709-085432.tar.gz`
    - `/volume1/docker/_backups/dshunter/docker-compose-20260709-085432.yml`
    - `/volume1/docker/_backups/dshunter/env-20260709-085432.bak`
  - 部署后容器 `dshunter` 为 `healthy`，镜像 ID 为 `sha256:77854769d8269a9d7b615425abd49afba8960a60e83bcca0149d9a510152996a`。
- 线上验证：
  - `https://dshunter.com` 返回 200，`/unlock` 返回 200，`/api/site-settings` 返回 200，未登录调用 `/api/admin/site-settings` 返回 401。
  - 浏览器打开 `/unlock` 可看到 live 资产读数：`493 域名`、`42 Zones`、`3 注册商`。
  - 登录后直接进入 `/dashboard`，页面标题为“指挥台 · dshunter”，并渲染“运营概览”内容。
  - 390x844 移动登录页无横向溢出，浏览器控制台无 error/warning。

## 2026-07-09 登录页站点品牌动态化阶段

- 已将 `/unlock` 登录页接入后台站点设置：
  - 登录页桌面品牌区和移动品牌区读取 `siteName`、`shortDescription`、`heroDescription`、`siteDescription`。
  - 登录页 Logo 读取 `logoUrl`，加载失败或为空时回退默认 `DeckMark`。
  - 登录页运行时同步 `document.title`、`description` meta 和 `faviconUrl`，与公开首页/后台品牌配置保持一致。
  - 保留配置读取失败时的默认设置，避免登录入口白屏。
- 本地验证：
  - `bun run lint` 通过，0 error / 0 warning。
  - `bun run typecheck` 通过。
  - `bun run build` 通过。
  - `git diff --check` 通过。
  - 敏感信息扫描无命中。
  - 本地浏览器 `/unlock` 显示本地站点配置 `DS Hunter Local QA`，title 为“登录 · DS Hunter Local QA”，桌面和 390x844 移动端均无控制台 error/warning，登录后可进入 `/dashboard`。
- GitHub 状态：
  - 本地提交：`78ed48e fix: 登录页接入站点品牌设置`。
  - 远端 `main` 提交：`48f1d719c3f3cc82c7e3f3e9ba744343ef509f20`。
  - GitHub Actions docker workflow `28987006961` 通过。
- NAS 部署：
  - 已部署到 NAS 实际项目 `/volume1/docker/dshunter`，仅重建并重启 `dshunter` 服务，未修改反代/frpc/frps 配置。
  - 本次 NAS 备份：
    - `/volume1/docker/_backups/dshunter/dshunter-20260709-091750.tar.gz`
    - `/volume1/docker/_backups/dshunter/dshunter-data-20260709-091750.tar.gz`
    - `/volume1/docker/_backups/dshunter/docker-compose-20260709-091750.yml`
    - `/volume1/docker/_backups/dshunter/env-20260709-091750.bak`
  - 部署后容器 `dshunter` 为 `healthy`，镜像 ID 为 `sha256:7a0c9ab9e486e002732843a4d5b1918afd17b2e278985857f7bae03c33f13688`。
  - NAS 本机验证：`/` 返回 200，`/unlock` 返回 200，`/api/site-settings` 返回 200，未登录调用 `/api/admin/site-settings` 返回 401。
- 线上验证：
  - `https://dshunter.com` 返回 200，`/unlock` 返回 200，`/api/site-settings` 返回 200，未登录调用 `/api/admin/site-settings` 返回 401。
  - 浏览器打开线上 `/unlock`，title 为“登录 · DS Hunter”，页面显示站点名称、短介绍、Hero 文案和 live 资产读数 `493 域名`、`42 Zones`、`3 注册商`。
  - 390x844 移动登录页无横向溢出，显示站点名称和短介绍，登录后可进入 `/dashboard`。
  - 本阶段未修改反代、frpc、frps 配置。

## 接手机器操作

```powershell
git clone https://github.com/NextCandy/dshunter.git
cd dshunter
git status
npm install
npm run typecheck
npm run build
```

生产敏感配置不在 Git 仓库内，继续部署前以 NAS `/volume1/docker/dshunter/.env` 和 `/volume1/docker/dshunter/data` 为准。
