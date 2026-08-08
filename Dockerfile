FROM oven/bun:1-alpine

WORKDIR /app

# Manifests first, so a source-only change doesn't reinstall dependencies.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

ENV PORT=3000
EXPOSE 3000
CMD ["bun", "src/index.ts"]
