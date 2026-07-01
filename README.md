# DomainOps

一个单用户、Token 全部保存在服务端的**域名批量运维控制台**：把散落在
Spaceship / Dynadot / Namecheap / 阿里云 / 腾讯云 / 西部数码 / Cloudflare
Registrar 的域名统一拉取，批量绑定到 Cloudflare，并对解析记录做
**批量增删 / 备份 / 差异对比 / 一键恢复**。

技术栈：TanStack Start (Vite) + React 19 + TailwindCSS v4 + shadcn/ui。
运行时：Node 20（Docker）或 Cloudflare Workers / Vercel Serverless。

---

## 功能

- 🔐 **共享密码 + 加密 Cookie 网关**：`/unlock` 输入 `SITE_PASSWORD` 才能进入，Token 全部在服务端读取，永不下发浏览器。
- 🌐 **多注册商域名拉取**：Spaceship、Dynadot、Namecheap、阿里云、腾讯云、西部数码、Cloudflare Registrar，一键 `拉取全部域名`。
- ⚡ **批量绑定 Cloudflare**：自动 `Create Zone` → 读取分配的 NS → 回写注册商 NS → 触发 `activation_check`。
- 📝 **批量解析记录**：
  - 模板 / CSV 上传，Zod 逐行校验，错误清单可下载，未清零错误禁止执行；
  - 支持 A / AAAA / CNAME / TXT / MX / NS / SRV / CAA；
  - 支持按类型 / 名称 / 内容匹配批量删除。
- 💾 **备份 & 恢复 & 差异**：
  - 一键导出 Zone 为 JSON / CSV；
  - 上传备份后与线上比对，输出「仅在备份 / 仅在线上 / 属性差异」三列；
  - 先生成**变更计划预览**（create / update / delete / skip），确认后再一键应用；
  - 恢复策略三选一：`补齐`（只加缺失）/ `覆盖`（加+改）/ `完全替换`（加+改+删）。
- 🌓 **深色 / 浅色 / 跟随系统** 主题切换，全站语义化 token。

---

## 目录结构

```
src/
  routes/                # TanStack 文件路由
    __root.tsx           # 全站壳（主题脚本、meta）
    unlock.tsx           # 密码网关
    _app.tsx             # 已解锁后的侧边栏布局
    _app.index.tsx       # 仪表盘
    _app.domains.tsx     # 拉取 / 选择域名
    _app.bind.tsx        # 批量绑定 Cloudflare
    _app.records.tsx     # 批量增删解析记录（CSV 校验）
    _app.backup.tsx      # 导出 / 差异 / 恢复
    _app.settings.tsx    # Token 状态、主题、部署指南
  lib/
    session.server.ts    # 加密 Cookie 会话
    auth-middleware.ts   # requireGate
    cloudflare.functions.ts
    backup.functions.ts
    registrars.functions.ts
    csv.ts               # Zod 校验 + 模板
    registrars/          # 各注册商 adapter（*.server.ts）
```

---

## 快速开始（Docker）

```bash
# 1. clone
git clone https://github.com/<your-name>/domainops.git
cd domainops

# 2. 生成密钥 & 写 .env
cp .env.example .env
# 生成 32 字节随机串
echo "SESSION_SECRET=$(openssl rand -hex 32)" >> .env
# 编辑 .env 填 SITE_PASSWORD / CLOUDFLARE_API_TOKEN / 各注册商 Token

# 3. 启动
docker compose up -d --build

# 4. 打开
open http://localhost:3000
```

访问后会跳到 `/unlock`，输入 `SITE_PASSWORD` 即可进入。

### 只用 docker（不用 compose）

```bash
docker build -t domainops .
docker run -d --name domainops -p 3000:3000 --env-file .env --restart unless-stopped domainops
```

### 反向代理（Nginx / Caddy）

容器监听 `3000`，直接 `proxy_pass http://127.0.0.1:3000;` 即可，无需 sticky
session。**必须** HTTPS，因为会话 Cookie 是 `Secure` 的。

Caddy 示例：

```caddy
domainops.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

---

## 环境变量

| 变量 | 是否必填 | 说明 |
| --- | --- | --- |
| `SESSION_SECRET` | ✅ | ≥ 32 字节随机串，加密 Session Cookie |
| `SITE_PASSWORD` | ✅ | `/unlock` 使用的共享密码 |
| `CLOUDFLARE_API_TOKEN` | ✅ | `Zone:Read/Edit`, `DNS:Edit`（可选 `Account:Read`） |
| `SPACESHIP_API_KEY` / `SPACESHIP_API_SECRET` | 可选 | Spaceship API Manager |
| `DYNADOT_API_KEY` | 可选 | Dynadot API v3 |
| `NAMECHEAP_API_USER` / `_API_KEY` / `_USERNAME` / `_CLIENT_IP` | 可选 | Namecheap，需在其后台把 `CLIENT_IP` 加白名单 |
| `ALIYUN_ACCESS_KEY_ID` / `_SECRET` | 可选 | 建议单独 RAM 用户，授 `AliyunDomainFullAccess` |
| `TENCENT_SECRET_ID` / `_KEY` | 可选 | 授 `QcloudDomainFullAccess` |
| `WEST_USERNAME` / `WEST_API_PASSWORD` | 可选 | 西部数码后台 → API 接口 |

未配置的注册商在 `/settings` 会显示「未配置」，`/domains` 对应按钮置灰。

---

## 推送到 GitHub

Lovable 项目本身可通过左下角 **+ → GitHub → Connect project** 双向同步。
如果本地手动推：

```bash
git init
git add .
git commit -m "init: DomainOps"
git branch -M main
git remote add origin git@github.com:<your-name>/domainops.git
git push -u origin main
```

推送前请**再次确认** `.env` 已在 `.gitignore`（本仓库默认已忽略），只提交
`.env.example`。

### 用 GitHub Actions 自动构建 Docker 镜像

新建 `.github/workflows/docker.yml`（示例）：

```yaml
name: docker
on:
  push:
    branches: [main]
    tags: ["v*"]
jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: |
            ghcr.io/${{ github.repository }}:latest
            ghcr.io/${{ github.repository }}:${{ github.sha }}
```

推送后可在任意服务器 `docker pull ghcr.io/<owner>/<repo>:latest` 直接跑。

---

## 部署到 Vercel（可选）

不想用 Docker 时，见根目录 [`DEPLOY_VERCEL.md`](./DEPLOY_VERCEL.md)。

---

## 本地开发

```bash
bun install        # 或 npm install
bun run dev        # http://localhost:8080
```

- 服务端函数：`createServerFn` 会被编译成 `/_serverFn/*`。
- 敏感调用统一走 `requireGate` 中间件，未解锁一律 401。
- 不要在客户端导入 `*.server.ts`（Vite 插件已强制隔离）。

---

## 常见问题

| 现象 | 原因 / 解决 |
| --- | --- |
| 构建报 `Cannot find module 'node:crypto'` | Node < 18；升到 20+ |
| 解锁后立刻被踢 | `SESSION_SECRET` 未配置或长度不足 32 |
| Namecheap 返回 `IP is not in whitelist` | 把服务器出口 IP 加入 Namecheap API 白名单，并写到 `NAMECHEAP_CLIENT_IP` |
| Cloudflare 403 | Token 权限不足，至少 `Zone.Zone:Edit` + `Zone.DNS:Edit` |
| Docker 容器一启动就退出 | 多半是 `SESSION_SECRET` / `SITE_PASSWORD` 未注入，`docker logs domainops` 看报错 |
| 反代后 Cookie 不下发 | 必须走 HTTPS；`Secure` Cookie 不会在 http 上下发 |

---

## 安全建议

- **只暴露 HTTPS**，禁止 80 端口直连。
- `SITE_PASSWORD` 使用 ≥ 16 位强口令，避免暴力破解。
- 注册商 Token 尽量最小权限（专用子账号 / RAM）。
- 定期在 `/backup` 导出 JSON 快照，出问题可回滚。

---

## License

MIT
