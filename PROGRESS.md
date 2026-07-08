# DS Hunter 工作进度

更新时间：2026-07-08

## 当前状态

- 主分支：`main`
- 远端仓库：`https://github.com/NextCandy/dshunter`
- 最近已推送阶段：
  - `ce6e11a fix: 允许空工作集管理 DNS 模板`
  - `c394fb9 feat: 增加 DNS 模板库`
  - `86baa6d feat: 增加后台操作日志`
  - `532777b feat: 增加通知中心和到期提醒`
  - `2424553 feat: 支持动态注册商配置`
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

下一阶段：

1. 将本阶段代码提交并同步到 GitHub、等待 CI，再备份部署到 NAS 实际项目并线上复核。
2. 为具体自定义注册商配置 REST 同步端点，先运行“同步端点预检”，再执行一次真实端到端同步入库。
3. 单独复核线上后台登录自动化，并确认浏览器后台设置页可登录进入。
4. 清理全仓历史 CRLF/Prettier 问题，使 `npm run lint` 可以作为全量门禁。
5. 继续完善移动端后台表单和域名列表密集信息展示。
6. 每完成一个阶段后继续执行：本地验证 -> GitHub 提交推送 -> CI -> NAS 备份部署 -> 线上验证。

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
