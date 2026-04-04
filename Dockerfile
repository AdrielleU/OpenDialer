FROM node:22-alpine AS builder

RUN apk add --no-cache python3 make g++
RUN npm install -g pnpm

WORKDIR /app
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml ./
COPY packages/server/package.json ./packages/server/
COPY packages/web/package.json ./packages/web/
RUN pnpm install --frozen-lockfile || pnpm install

COPY tsconfig.base.json ./
COPY packages/server ./packages/server
COPY packages/web ./packages/web
RUN pnpm build

FROM node:22-alpine

RUN apk add --no-cache python3 make g++
RUN npm install -g pnpm

WORKDIR /app
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml ./
COPY packages/server/package.json ./packages/server/
RUN pnpm install --prod --frozen-lockfile || pnpm install --prod

COPY --from=builder /app/packages/server/dist ./packages/server/dist
COPY --from=builder /app/packages/server/drizzle ./packages/server/drizzle
COPY --from=builder /app/packages/web/dist ./packages/web/dist

WORKDIR /app/packages/server
RUN mkdir -p data uploads

EXPOSE 3000
CMD ["node", "dist/index.js"]
