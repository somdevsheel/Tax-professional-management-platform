# Multi-stage build for the API. Uses `pnpm deploy` to resolve workspace:* dependencies
# (@tax-platform/types) into a self-contained, production-only node_modules — the officially
# recommended pattern for pnpm monorepos (docs/deployment.md §1, §4).
#
# Build from the REPO ROOT, not this directory:
#   docker build -f apps/api/Dockerfile -t tax-platform-api .

FROM node:20-slim AS base
# Prisma's query engine needs OpenSSL to pick the right engine binary — installed here, in the
# stage both `build` (where `prisma generate` runs) and `runtime` descend from, so the engine
# generated at build time actually matches what's available at run time. Missing this in the
# build stage silently makes Prisma guess an engine target, which can mismatch the runtime
# image (a real, easy-to-miss bug in a lot of Prisma+Docker setups — caught by actually
# building and running this image rather than assuming the Dockerfile was right).
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
# Pinned globally, not just via the repo's package.json#packageManager field — the deployed
# package below (`/prod/api`) lives outside the repo tree, so Corepack can't discover that
# field from there and silently grabs the latest pnpm instead, which requires Node 22+ and
# crashes on this Node 20 base (caught by actually running this build, not assumed).
RUN corepack prepare pnpm@9.15.9 --activate
WORKDIR /repo

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @tax-platform/types build
# Needed for `nest build`'s own type-check (it imports Prisma's generated types) — and again,
# separately, after `deploy` below, because deploy gives the package a fresh node_modules that
# doesn't carry the first generate's output with it.
RUN pnpm --filter @tax-platform/api prisma:generate
RUN pnpm --filter @tax-platform/api build
# Deliberately NOT `deploy --prod` here: `--prod` excludes the `prisma` CLI (a devDependency),
# but `@prisma/client` only becomes usable after `prisma generate` runs against the schema —
# with `--prod` that generate step has nothing to generate with, and the app fails at startup
# with "@prisma/client did not initialize yet" (caught by actually running the built image,
# not just building it). So: deploy with dev deps included, generate, then prune.
RUN pnpm --filter @tax-platform/api deploy --prod /prod/api
# `prisma` is a regular dependency (not dev) of @tax-platform/api specifically so it survives
# `--prod` here and `generate` has something to run — the deployed package gets its own fresh
# node_modules that doesn't carry over the first `prisma:generate` run above.
RUN cd /prod/api && ./node_modules/.bin/prisma generate

# --- Runtime image ---
FROM base AS runtime

# Never run the API as root in production (docs/security-design.md — least privilege).
RUN groupadd --system app && useradd --system --gid app --no-create-home app

WORKDIR /app
COPY --from=build /prod/api .
# Prisma's generated client (built inside node_modules during `pnpm deploy`) already includes
# the query engine binary matched to this image's platform since prisma:generate ran on the
# same node:20-slim base.

ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000

USER app

# Liveness — matches GET /health (docs/api-design.md §9, docs/deployment.md §5).
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:'+(process.env.PORT||4000)+'/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "dist/main.js"]
