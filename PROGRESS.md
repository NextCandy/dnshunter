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

## 验证记录

最近阶段已验证：

- 本地定向 ESLint、typecheck、build 通过。
- GitHub Actions docker workflow 成功。
- NAS 已备份、重建、重启。
- `dshunter` 容器 healthy。
- `https://dshunter.com` 首页 200。
- `/api/site-settings` 正常。
- 桌面和手机浏览器验证过首页、登录页、站点设置页、解析记录页。

下一阶段继续开发前建议重新运行：

```powershell
npx prettier --write src/lib/secrets.server.ts src/lib/secrets.functions.ts src/routes/_app.settings.tsx PROGRESS.md
npx eslint src/lib/secrets.server.ts src/lib/secrets.functions.ts src/routes/_app.settings.tsx
npm run typecheck
npm run build
```

## 下一步建议

1. 为自定义注册商增加真实同步适配器接口。
2. 在注册商目录中区分“凭证已配置”和“自动同步可用”两个计数。
3. 清理全仓历史 CRLF/Prettier 问题，使 `npm run lint` 可以作为全量门禁。
4. 继续完善移动端后台表单和域名列表密集信息展示。
5. 每完成一个阶段后继续执行：本地验证 -> GitHub 提交推送 -> CI -> NAS 备份部署 -> 线上验证。

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
