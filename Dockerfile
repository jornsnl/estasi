# Works on Render and Railway (both build from this Dockerfile when present).
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./
EXPOSE 3000
# Migrations first, also when the host has no pre-deploy command (or it is switched off): the
# script only runs what is new and holds a lock, so running it twice is harmless. If a migration
# fails the app does not start, the health check fails and the previous version keeps running.
CMD ["sh", "-c", "node scripts/migrate.mjs && exec node_modules/.bin/next start -H 0.0.0.0 -p ${PORT:-3000}"]
