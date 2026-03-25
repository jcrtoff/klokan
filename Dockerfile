FROM node:20-alpine

# Non-root user for security
RUN addgroup -S app && adduser -S app -G app

WORKDIR /app

# Dependencies first (layer cache)
COPY package*.json ./
COPY prisma/ ./prisma/
COPY prisma.config.ts ./
RUN npm ci --omit=dev && npx prisma generate

# App source
COPY server.js ./
COPY lib/ ./lib/
COPY public/ ./public/

# Ownership
RUN chown -R app:app /app
USER app

ARG COMMIT_SHA=unknown
ENV COMMIT_SHA=${COMMIT_SHA}

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["sh", "-c", "npx prisma migrate deploy && node server.js"]
