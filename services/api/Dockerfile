FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates clamav clamav-freshclam gosu && rm -rf /var/lib/apt/lists/*
RUN test -x /usr/bin/clamscan && test -x /usr/bin/freshclam && command -v gosu
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig*.json prisma.config.ts ./
COPY prisma ./prisma
COPY src ./src
COPY scripts ./scripts
COPY ops ./ops
RUN sed -i 's/\r$//' ops/docker-entrypoint.sh && chmod 755 ops/docker-entrypoint.sh
RUN npm run build
# Prisma CLI remains installed for a separately approved migration command.
ENV NODE_ENV=production
ENV HOST=0.0.0.0
# Entrypoint provisions only the attached private volume, then drops to node.
ENTRYPOINT ["/app/ops/docker-entrypoint.sh"]
EXPOSE 3000
CMD ["node", "dist/server.js"]
