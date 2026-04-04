# Contributing to OpenDialer

Created by **AdrielleU** | Sponsored by **AIIVARS LLC**

Thanks for your interest in contributing to OpenDialer! This guide will help you get started.

## Getting Started

1. Fork the repository
2. Clone your fork locally
3. Install dependencies: `pnpm install`
4. Copy `.env.example` to `.env` and fill in your Telnyx credentials
5. Start the dev servers: `pnpm dev`

## Development Setup

- **Node.js 20+** required
- **pnpm** is the package manager (monorepo workspaces)
- Backend runs on `http://localhost:3000`
- Frontend runs on `http://localhost:5173` (Vite dev server proxies API requests)
- For webhook testing, you'll need a public URL — use `docker compose --profile tunnel up` for a Cloudflare Tunnel

## Project Structure

This is a pnpm monorepo with two packages:

- `packages/server/` — Fastify backend (TypeScript)
- `packages/web/` — React frontend (TypeScript + Vite + Tailwind)

## Code Style

- **TypeScript** strict mode in both packages
- **Prettier** handles formatting (see `.prettierrc`):
  - Single quotes, semicolons, trailing commas
  - 100 character line width, 2-space indentation
- Run `pnpm build` to check for type errors before submitting

## Making Changes

### Database Schema Changes

1. Edit `packages/server/src/db/schema.ts`
2. Generate a migration: `pnpm -r db:generate`
3. Migrations auto-run on server startup

### Adding API Endpoints

- Add route files in `packages/server/src/routes/`
- Register them in `packages/server/src/index.ts`
- Add corresponding API client methods in `packages/web/src/lib/api.ts`

### Adding Frontend Pages

- Add page components in `packages/web/src/pages/`
- Register routes in `packages/web/src/App.tsx`
- Add navigation links in `packages/web/src/components/Layout.tsx`

## Pull Requests

1. Create a feature branch from `main`
2. Keep PRs focused — one feature or fix per PR
3. Ensure `pnpm build` passes with no errors
4. Write a clear PR description explaining what and why

## Reporting Issues

- Use GitHub Issues to report bugs or request features
- Include steps to reproduce for bugs
- Include your environment info (OS, Node version, browser)

## License

By contributing, you agree that your contributions will be licensed under the AGPL-3.0 license.
