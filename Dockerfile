# Debian-slim (not alpine) so the prebuilt sqlite3 native binary matches glibc
# without needing a node-gyp rebuild.
FROM node:20-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

# Data dir for the sqlite file + uploaded documents. In production this path
# is a mounted Fly volume (see fly.toml) so it survives restarts/redeploys.
RUN mkdir -p /data/uploads

ENV NODE_ENV=production
ENV PORT=8080
ENV DB_STORAGE=/data/clickormedia.sqlite
ENV UPLOAD_DIR=/data/uploads

EXPOSE 8080

CMD ["node", "server.js"]
