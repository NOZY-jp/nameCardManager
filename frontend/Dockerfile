FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
# バージョンを固定しないと corepack が最新の pnpm (12 系) を取り、
# build script 承認仕様の変更で pnpm install が ERR_PNPM_IGNORED_BUILDS で落ちる。
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate

FROM base AS deps
WORKDIR /app
# pnpm-workspace.yaml の allowBuilds（sharp / esbuild などの build script 許可）も必要
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM base AS dev
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
CMD ["pnpm", "dev"]

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}

RUN pnpm build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

ENV NEXT_PUBLIC_API_BASE_URL=/api/v1

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
