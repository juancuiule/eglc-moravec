FROM node:24-alpine AS build
WORKDIR /app
COPY pnpm-workspace.yaml package.json ./
COPY packages/engine ./packages/engine
COPY apps/backend ./apps/backend
RUN corepack enable && pnpm install
RUN pnpm --filter engine build
RUN pnpm --filter backend build
RUN pnpm --filter backend deploy --prod --legacy /app/deploy

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/deploy/dist ./dist
COPY --from=build /app/deploy/node_modules ./node_modules
COPY --from=build /app/deploy/package.json ./package.json
EXPOSE 3000
CMD ["node", "dist/server.js"]
