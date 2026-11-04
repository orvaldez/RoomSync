# RoomSync client (#116). Build stage: `npm run build` (typecheck, then Vite).
# Runtime: nginx serves the built files and proxies /api to the server, so
# the browser sees one origin, as it does with Vite's dev proxy. The session
# cookie (SameSite=Lax) and the absence of any CORS setup rely on that.

# ---- build ------------------------------------------------------------------
FROM node:20-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---- runtime ----------------------------------------------------------------
# nginx's unprivileged image: runs as a non-root user and listens on 8080.
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime

# Where /api goes. Compose's default is the `server` service; the deployment
# (#117) sets its own. The official image fills ${...} in templates from the
# environment at start.
ENV API_UPSTREAM=http://server:4000

COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080
