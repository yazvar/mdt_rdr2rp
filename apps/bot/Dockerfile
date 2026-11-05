FROM node:20-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/bot/package.json apps/bot/package.json
COPY apps/desktop/package.json apps/desktop/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci --workspace=@mdt/bot --workspace=@mdt/shared --include-workspace-root
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/bot apps/bot
COPY prisma prisma
RUN npm run build -w @mdt/shared && npx prisma generate && npm run build -w @mdt/bot
ENV NODE_ENV=production
EXPOSE 3002
CMD ["node", "apps/bot/dist/index.js"]
