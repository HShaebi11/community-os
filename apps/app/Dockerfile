# Community OS app — Next.js product UI.
# Build from the repo root:  docker build -f apps/app/Dockerfile .
FROM node:22-alpine
WORKDIR /repo

# All workspace manifests first so `npm ci` sees a consistent workspace tree.
COPY package.json package-lock.json ./
COPY scripts ./scripts
COPY apps/api/package.json apps/api/package.json
COPY apps/app/package.json apps/app/package.json
COPY apps/mcp/package.json apps/mcp/package.json
COPY packages ./packages

RUN npm ci

# Rewrites for /v1 and /mcp are resolved at build time.
ARG API_PROXY_TARGET=http://localhost:5173
ENV API_PROXY_TARGET=$API_PROXY_TARGET

COPY apps/app ./apps/app
RUN npm run build -w @community-os/app

EXPOSE 3002

CMD ["npm", "run", "start", "-w", "@community-os/app"]
