FROM node:24-alpine AS build
WORKDIR /app
COPY package.json tsconfig.json tsconfig.build.json pnpm-workspace.yaml ./
COPY src ./src
RUN corepack enable && pnpm install && pnpm build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
EXPOSE 3000
CMD ["node", "dist/server.js"]
