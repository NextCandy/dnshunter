# 部署 DomainOps 到 Vercel

DomainOps 是一个基于 **TanStack Start (Vite)** 的全栈应用，前端 + 服务端函数打包在同一份产物里，不依赖任何数据库（所有状态都保存在 Cloudflare / 注册商 侧，本机只用加密 Cookie 存"已解锁"标记）。

## 1. 推送代码到 GitHub

```bash
git init
git add .
git commit -m "init"
git remote add origin git@github.com:<你的用户名>/domainops.git
git push -u origin main
```

## 2. Vercel Import

1. 打开 https://vercel.com/new → **Import Git Repository** 选中该仓库。
2. Framework Preset：选 **Other**（TanStack Start 会用它自己的 Vite 插件）。
3. Build & Output Settings：
   - **Install Command**：`bun install`（或 `npm install`）
   - **Build Command**：`bun run build`
   - **Output Directory**：`.output/public`
4. Node.js Version：**20.x** 或以上。

## 3. 环境变量（Project → Settings → Environment Variables）

**必填：**

| 变量 | 说明 |
| --- | --- |
| `SESSION_SECRET` | 32+ 位随机字符串，用来加密 Session Cookie |
| `SITE_PASSWORD` | 打开站点需要输入的共享密码 |
| `CLOUDFLARE_API_TOKEN` | 权限：Account:Read、Zone:Edit、DNS:Edit |

**注册商（按需配置，未配置的入口会置灰）：**

| 注册商 | 变量 |
| --- | --- |
| Spaceship | `SPACESHIP_API_KEY`, `SPACESHIP_API_SECRET` |
| Dynadot | `DYNADOT_API_KEY` |
| Namecheap | `NAMECHEAP_API_USER`, `NAMECHEAP_API_KEY`, `NAMECHEAP_USERNAME`, `NAMECHEAP_CLIENT_IP` |
| 阿里云 | `ALIYUN_ACCESS_KEY_ID`, `ALIYUN_ACCESS_KEY_SECRET` |
| 腾讯云 | `TENCENT_SECRET_ID`, `TENCENT_SECRET_KEY` |
| 西部数码 | `WEST_USERNAME`, `WEST_API_PASSWORD` |

添加后勾选 **Production / Preview / Development** 三个环境。

> 生成 `SESSION_SECRET`：`openssl rand -hex 32`
>
> Namecheap 需要在其后台把 Vercel 出口 IP 加入白名单；Vercel Serverless 出口 IP 不固定，推荐通过 **Static IP / Vercel Secure Compute** 或用一台固定 IP 的代理。若不方便，可在本地或 VPS 自建反代后再调用。

## 4. 部署 & 验证

1. 点击 **Deploy**，等待首次构建完成。
2. 打开 `https://<项目>.vercel.app/` → 应自动跳到 `/unlock`。
3. 输入 `SITE_PASSWORD`，进入仪表盘。
4. 打开 `/settings` 检查每个注册商 Token 是否显示"已配置"。

## 5. 数据库？

**当前版本不需要数据库。** 所有域名 / 解析记录都是实时读写 Cloudflare 与注册商 API；用户在 `/domains` 页面选中的域名列表只保存在浏览器 `localStorage`。

如果之后需要多用户 / 审计日志 / 定时任务，可以接入：

- Neon / Supabase / Cloudflare D1 作为 Postgres
- 在 `src/lib/*.server.ts` 中新增一个 `db.server.ts` 封装连接
- 相应新增迁移与鉴权（这一步不属于本模板）

## 6. 服务端函数

TanStack Start 用 `createServerFn(...)` 声明的函数会被 Vite 插件编译成 `POST /_serverFn/<hash>` 路由，Vercel 自动作为 Node/Edge Serverless Function 部署，**不需要额外的 `api/` 目录或 `vercel.json`**。

- 客户端只导入 stub（fetch 调用），服务端保留完整实现。
- `.server.ts` 结尾的模块会被强制排除出客户端 bundle，用来放注册商 SDK。
- 所有敏感调用都通过 `requireGate` 中间件校验 Cookie，未解锁一律 401。

## 7. 自定义域名（可选）

Project → **Settings → Domains** → 添加你的域名并按提示配置 DNS。绑定完成后即可以自己的域名访问。

## 8. 常见问题

- **构建失败：Cannot find module 'node:crypto'** → Node 版本 < 18，升级到 20。
- **解锁后立刻被踢出** → `SESSION_SECRET` 未设置或长度不足 32；重新生成并重部署。
- **Namecheap 报 "IP is not in whitelist"** → 见第 3 节最后的注意事项。
- **Cloudflare 403** → Token 权限不足，至少要 `Zone.Zone: Edit` + `Zone.DNS: Edit`。
