# The Nkata server for AWS Fargate (docs/deploy.md). One image, one process: migrate, ensure the bucket,
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
# RDS requires TLS and signs with its own roots, which Node does not ship. The bundle is AWS's
# global one: https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/UsingWithRDS.SSL.html
ENV NODE_EXTRA_CA_CERTS=/app/server/certs/rds-global-bundle.pem
ENV HOST=0.0.0.0
ENV PORT=7400
EXPOSE 7400
USER node
CMD ["pnpm", "--filter", "@nkata/server", "exec", "tsx", "src/main.ts"]
