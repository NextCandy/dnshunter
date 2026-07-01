# syntax=docker/dockerfile:1.7

# ---------- Builder ----------
FROM oven/bun:1.1 AS builder
WORKDIR /app

# 安装依赖（利用缓存层）
COPY package.json bun.lockb* bunfig.toml* ./
RUN bun install --frozen-lockfile || bun install

# 拷贝源代码
COPY . .

# 使用 nitro 的 node-server preset 产出可在容器中运行的 Node 服务
ENV NITRO_PRESET=node-server
RUN bun run build

# ---------- Runtime ----------
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# 只拷贝构建产物
COPY --from=builder /app/.output ./.output

EXPOSE 3000

# nitro node-server 产物入口
CMD ["node", ".output/server/index.mjs"]
