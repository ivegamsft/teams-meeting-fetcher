FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

FROM node:20-alpine AS production

WORKDIR /app

ENV NODE_ENV=production

RUN apk add --no-cache openssl

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY public/ ./public/

RUN addgroup -g 1001 -S nodejs && \
    adduser -S appuser -u 1001 -G nodejs && \
    mkdir -p /app/certs && \
    openssl req -x509 -newkey rsa:2048 -keyout /app/certs/server.key \
      -out /app/certs/server.crt -days 365 -nodes \
      -subj "/CN=admin-app" 2>/dev/null && \
    chown -R appuser:nodejs /app/certs

USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider --no-check-certificate https://localhost:3000/health || exit 1

CMD ["node", "dist/server.js"]
