# Use Debian slim so optional native deps can build if needed
FROM node:22-bookworm-slim

WORKDIR /app

# Build tools for optional websocket native modules
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.js ./
COPY public ./public

ENV NODE_ENV=production
ENV PORT=3030
EXPOSE 3030

CMD ["npm", "start"]
