FROM node:24-alpine AS build
WORKDIR /app
# NEXT_PUBLIC_* vars are inlined into the client (and server) bundles at
# build time, not read from the container's runtime environment — this
# must be set here, not just in docker-compose's `environment:`.
ARG NEXT_PUBLIC_API_URL=http://localhost:3000
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
COPY pnpm-workspace.yaml package.json ./
COPY packages/engine ./packages/engine
COPY apps/frontend ./apps/frontend
RUN corepack enable && pnpm install
RUN pnpm --filter engine build
RUN pnpm --filter frontend build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
COPY --from=build /app/apps/frontend/.next/standalone ./
COPY --from=build /app/apps/frontend/.next/static ./apps/frontend/.next/static
EXPOSE 3000
CMD ["node", "apps/frontend/server.js"]
