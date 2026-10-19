# The Nkata server for Fly (docs/deploy.md). One image, one process: migrate, ensure the bucket,
# listen. Built from the repo root so the shared package is in the workspace.
# pnpm in Docker: https://pnpm.io/docker
FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY shared/package.json shared/
COPY server/package.json server/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --filter @nkata/shared... --filter @nkata/server...

FROM deps AS app
COPY shared/ shared/
COPY server/ server/
# tsx runs the TypeScript as is, as make dev and make test do; no separate build to drift.
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=7400
EXPOSE 7400
USER node
CMD ["pnpm", "--filter", "@nkata/server", "exec", "tsx", "src/main.ts"]
