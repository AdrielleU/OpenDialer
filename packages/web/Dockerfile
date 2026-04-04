FROM node:22-alpine AS builder

RUN npm install -g pnpm

WORKDIR /app
COPY pnpm-workspace.yaml package.json ./
COPY packages/web/package.json ./packages/web/
RUN cd packages/web && pnpm install

COPY packages/web ./packages/web
RUN cd packages/web && pnpm build

FROM nginx:alpine
COPY --from=builder /app/packages/web/dist /usr/share/nginx/html
COPY packages/web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
