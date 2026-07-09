<div align="center">

<img src="./public/favicon.svg" width="88" height="88" alt="DS Hunter logo" />

# DS Hunter · Command Deck

**看得见的域名资产台账 —— 单用户域名资产与 DNS 运维指挥台**

把分散在 Cloudflare、Spaceship、Dynadot、Porkbun、Namecheap、阿里云、腾讯云、西部数码等平台的域名，
统一拉取、去重、绑定到 Cloudflare，并支持 DNS 记录批量增删、实时解析查询、备份与恢复。

![TanStack Start](https://img.shields.io/badge/TanStack_Start-v1-6d6ee8) ![React](https://img.shields.io/badge/React-19-61dafb) ![Tailwind](https://img.shields.io/badge/Tailwind-v4-38bdf8) ![Docker](https://img.shields.io/badge/Docker-ready-2496ed) ![License](https://img.shields.io/badge/license-MIT-green)

</div>

---

## ✨ 特性总览

DS Hunter 采用自研的 **「Command Deck / 指挥台」** 设计语言（靛蓝主色 + 翠青/琥珀/玫红三信号色、蓝图网格、雷达准星标志、Space Grotesk + JetBrains Mono 排版），深浅色自适应，桌面与手机双端适配。

### 域名资产

- **公开首页 `/`** — 无需登录即可查看域名资产台账：总数、覆盖注册商、Cloudflare 接入、待接入等仪表读数；表格含**注册日期 / 到期日期**（临近到期自动着色）、DNS 状态、来源标记，支持搜索，移动端响应式。
- **多来源合并** — 注册商 API 拉取 + 手动录入两类来源自动合并去重，前台一张总表。
- **域名列表 `/domains`** — 从 8 家注册商与 Cloudflare Zone 拉取域名，合并去重，标注 NS 托管商与 CF 接入状态，保存为工作集供后续批量操作。

### 手动域名（独立管理）

- **手动录入 / CSV 导入** — 手动输入或导入 CSV/TXT，自动提取域名去重；**添加时自动查询一次 NS 托管商并回填**。
- **完整信息编辑** — 每个手动域名可编辑注册商、DNS 修改地址、NS 服务器、注册/到期日期、备注、标签、分组。
- **批量操作** — 多选后批量编辑（统一设置注册商/分组/标签/DNS 地址）或批量删除。
- **写入即备份 + 一键恢复** — 每次改动前自动快照到 `data/manual-domains.backups/`（保留最近 20 份），可在「备份 / 恢复」弹窗回滚到任意时间点。

### DNS

- **实时解析查看** — 对任意域名（无论是否接入 CF）实时查询 A / AAAA / CNAME / MX / TXT / NS 记录并列出，识别 NS 托管商，支持逐条 / 全部复制、重新查询。
- **智能修改入口** — 已接入 Cloudflare 的域名跳站内解析页直接编辑；其余域名按识别出的托管商跳对应管理台。
- **批量绑定 `/bind`** — 为选中域名批量创建 Cloudflare Zone，可选自动更新注册商 NS。
- **解析记录 `/records`** — 单域名 DNS 管理、CSV / 模板批量添加、批量删除前二次确认、结果汇总导出。

### 运维

- **指挥台 `/dashboard`** — 运营概览：来源配置、Cloudflare Zone 健康、工作集、最近同步。
- **备份恢复 `/backup`** — 导出 JSON / CSV，与线上记录做差异对比，按策略恢复。
- **设置 `/settings`** — 保存加密 API 凭证、测试连接、切换主题。凭证经 AES-256-GCM 加密存于服务端，浏览器只见「已连接 / 未配置」。
- **站点锁 `/unlock`** — 共享密码网关，凭证只在服务端读取，不下发到浏览器。

## 🧱 技术栈

TanStack Start v1 · React 19 · TailwindCSS v4 · shadcn/ui · TanStack Query/Router · Node 20 · Bun（构建）。
默认以 Docker 方式部署，适合群晖、飞牛、Portainer、unRAID 与轻量服务器。

## 🚀 快速部署（Docker）

```bash
cp .env.example .env
echo "SESSION_SECRET=$(openssl rand -hex 32)" >> .env
echo "SITE_PASSWORD=你的后台密码" >> .env
docker compose up -d --build
```

访问 `http://<host>:3000`（compose 默认宿主端口 `HOST_PORT`，可改）进入公开首页；后台入口 `/unlock`。

## 🛠 本地开发

```bash
bun install
bun run dev        # Vite 开发服务器
bun run typecheck  # tsc --noEmit 类型检查
bun run build      # 生产构建（nitro node-server）
```

## ⚙️ 环境变量

| 变量                                                               | 必填 | 说明                                    |
| ------------------------------------------------------------------ | ---- | --------------------------------------- |
| `SESSION_SECRET`                                                   | 是   | 至少 32 字节，用于加密会话 Cookie       |
| `SITE_PASSWORD`                                                    | 是   | `/unlock` 使用的后台密码                |
| `CLOUDFLARE_API_TOKEN`                                             | 建议 | Cloudflare Zone / DNS 操作 Token        |
| `TZ`                                                               | 否   | 默认 `Asia/Shanghai`，用于日期格式一致  |
| `COOKIE_SECURE`                                                    | 否   | 默认 `true`；内网 HTTP 测试可设 `false` |
| `HOST_PORT`                                                        | 否   | compose 宿主机端口，默认 `3000`         |
| `SPACESHIP_API_KEY` / `SPACESHIP_API_SECRET`                       | 否   | Spaceship                               |
| `DYNADOT_API_KEY`                                                  | 否   | Dynadot                                 |
| `PORKBUN_API_KEY` / `PORKBUN_SECRET_API_KEY`                       | 否   | Porkbun                                 |
| `NAMECHEAP_API_USER` / `NAMECHEAP_API_KEY` / `NAMECHEAP_CLIENT_IP` | 否   | Namecheap（需 IP 白名单）               |
| `ALIYUN_ACCESS_KEY_ID` / `ALIYUN_ACCESS_KEY_SECRET`                | 否   | 阿里云                                  |
| `TENCENT_SECRET_ID` / `TENCENT_SECRET_KEY`                         | 否   | 腾讯云                                  |
| `WEST_USERNAME` / `WEST_API_PASSWORD`                              | 否   | 西部数码                                |

凭证也可在后台 `/settings` 直接保存（AES-256-GCM 加密写入服务端 `data/secrets.json`）。

## 💾 数据与持久化

所有服务端数据存放于挂载卷 `data/`：

| 文件                           | 说明                                                           |
| ------------------------------ | -------------------------------------------------------------- |
| `data/registrar-domains.json`  | 注册商 API 拉取并持久化的域名资产                              |
| `data/manual-domains.json`     | 手动录入 / 导入的域名                                          |
| `data/manual-domains.backups/` | 手动域名的**自动写入备份**（保留最近 20 份，可在后台一键恢复） |
| `data/secrets.json`            | AES-256-GCM 加密的 API 凭证                                    |

`docker-compose.yml` 将 `./data` 绑定挂载到容器 `/app/data`，容器重建不丢数据。

## 🔒 安全建议

- 生产环境仅通过 HTTPS 暴露服务。
- `SITE_PASSWORD` 使用 16 位以上强口令。
- 注册商与 Cloudflare Token 使用最小权限。
- 定期在 `/backup` 导出 JSON 快照；手动域名依赖内置自动备份即可回滚。

## 🛠️ 当前维护状态

截至 2026-07-09，主分支已完成站点设置、动态注册商、注册商同步预检、全量 lint 门禁、API 类型收紧、Fast Refresh lint 清零与构建弃用提示清理。最新阶段记录、NAS 部署状态、验证证据和回滚提示见 [`PROGRESS.md`](./PROGRESS.md)。

本地接手机器建议先执行：

```bash
bun install
bun run lint
bun run typecheck
bun run build
```

当前质量门禁为 `lint` 0 warning、`typecheck` 通过、生产构建通过；构建输出不再包含 TanStack Start `inputValidator()` 或 `vite-tsconfig-paths` 弃用提示。

生产部署以 NAS `/volume1/docker/dshunter` 为准。部署前必须先备份项目目录、`data/`、compose 与 `.env`，且不得覆盖生产 `data/` 或 `.env`。最近两个代码阶段已同步 GitHub 并通过 CI，但 NAS SSH 认证暂未恢复，因此 NAS 实际部署需在凭据恢复后继续执行。

## 🧩 GitHub Actions

仓库内置 `.github/workflows/docker.yml`。推送到 `main` 或 `v*` tag 后，会构建 `linux/amd64` 与 `linux/arm64` 镜像并发布到 GHCR。

## 📄 License

MIT
