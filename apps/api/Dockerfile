# Community OS API — self-hosted Node server.
# Build from the repo root:  docker build -f apps/api/Dockerfile .
FROM node:22-alpine
WORKDIR /repo

# All workspace manifests first so `npm ci` sees a consistent workspace tree.
COPY package.json package-lock.json ./
COPY scripts ./scripts
COPY apps/api/package.json apps/api/package.json
COPY apps/app/package.json apps/app/package.json
COPY apps/mcp/package.json apps/mcp/package.json
COPY packages ./packages

RUN npm ci --omit=dev

COPY apps/api ./apps/api
COPY apps/mcp ./apps/mcp

ENV HOST=0.0.0.0 PORT=5173
EXPOSE 5173

CMD ["npm", "run", "start:node", "-w", "api"]
