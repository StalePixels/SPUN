# Build context is src/, so the image can compile the NBNtools engine from
# the submodule next to SPUNServer. See docker-compose.yml.
FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /app/server

FROM base AS deps
COPY server/package.json server/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

FROM base AS build
COPY server/package.json server/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY vendor/NBNtools/server/package.json /app/vendor/NBNtools/server/
COPY vendor/NBNtools/server/src /app/vendor/NBNtools/server/src
COPY server/tsconfig.json ./
COPY server/src ./src
RUN pnpm exec tsc -p tsconfig.json

FROM node:24-alpine AS run
WORKDIR /app/server
ENV NODE_ENV=production
COPY server/package.json ./
COPY --from=deps /app/server/node_modules ./node_modules
COPY --from=build /app/server/build ./build
USER node
EXPOSE 48128
CMD ["node", "build/server/src/main.js"]
