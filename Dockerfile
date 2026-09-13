# syntax=docker/dockerfile:1
FROM node:22.23.2-bookworm-slim AS build
WORKDIR /app

# tsx is a devDependency and is also the beta API's TypeScript runtime.
# Keep dev dependencies deliberately; do not prune them before running the API.
COPY package.json package-lock.json ./
RUN npm ci --include=dev --no-audit --no-fund
COPY tsconfig.json vite.config.ts capacitor.config.ts index.html ./
COPY src ./src
COPY server ./server
COPY public ./public
COPY scripts/build-sw.mjs scripts/textbook-local-plugin.ts ./scripts/
RUN npm run build

FROM node:22.23.2-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8787 \
    DATA_DIR=/app/.data

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY --from=build /app/server ./server
COPY --from=build /app/src/domain ./src/domain
COPY --from=build /app/dist ./dist
RUN mkdir -p /app/.data && chown node:node /app/.data

USER node
VOLUME ["/app/.data"]
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health',{signal:AbortSignal.timeout(4000)}).then(async r=>{if(!r.ok||!(await r.json()).ok)process.exit(1)}).catch(()=>process.exit(1))"

# Direct Node invocation lets SIGTERM reach the server's SQLite shutdown handler.
CMD ["node", "--import", "tsx", "server/index.ts"]
