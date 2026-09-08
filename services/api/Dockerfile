FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig*.json prisma.config.ts ./
COPY prisma ./prisma
COPY src ./src
COPY scripts ./scripts
RUN npm run build
# Prisma CLI remains installed for a separately approved migration command.
ENV NODE_ENV=production
ENV HOST=0.0.0.0
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
