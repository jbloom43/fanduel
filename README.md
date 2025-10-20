# NFL Goal Tracker (Hobby Prototype)

A lightweight hobby project that tracks live NFL player stats from ESPN's public JSON feeds and compares them to user-defined goals in real time.

> **Legal note:** ESPN JSON endpoints are undocumented and may change or become unavailable at any time. They are consumed here strictly for personal, non-commercial hobby use. For production or commercial scenarios you must replace the adapter with a licensed data provider.

## Monorepo layout

- `server/` — Node.js + Express + Socket.IO backend with polling, normalization, and optional mock data mode.
- `client/` — React + Vite + Tailwind UI that subscribes to live updates and visualizes progress toward custom goals.

## Prerequisites

- Node.js 18+
- npm 9+

## Setup

1. Install dependencies from the repository root:

   ```bash
   npm install
   ```

2. Create an environment file for the server:

   ```bash
   cp server/.env.example server/.env
   ```

   Update values as needed. Useful variables:

   - `PORT` — HTTP port for the API/server (default `3001`).
   - `POLL_MS` — Base polling interval in milliseconds (default `5000`).
   - `USE_MOCKS` — Set to `true` to use the built-in fake game feed for demos/offline work.

## Running in development

Run both server and client in watch mode:

```bash
npm run dev
```

- Server: http://localhost:3001
- Client: http://localhost:5173 (proxies `/api/*` to the server)

When the client loads:

1. Pick a game from the sticky header (defaults to the first “tonight” game if available).
2. Search/select a player, choose a stat (passing/rushing/receiving yards or TDs), and enter a goal value.
3. Watch the live dashboard update as the server polls ESPN and pushes deltas over Socket.IO. Goals persist in `localStorage`.
4. When a goal is hit you’ll get a celebratory burst of confetti.

If the real feed is unavailable or you just want a quick demo, set `USE_MOCKS=true` in `server/.env` and restart — the mock engine simulates a game with steady stat updates.

## Production build

```bash
npm run build
```

- Builds the client with Vite.
- Compiles the TypeScript server to `server/dist`.

Serve the production build:

```bash
npm run start
```

This runs the compiled Express server. If `client/` has been built, its static assets are served from `server/public`.

## API reference

| Endpoint | Description |
| --- | --- |
| `GET /api/games/tonight` | Lists the NFL games happening tonight (`id`, `homeTeam`, `awayTeam`, `startTime`). |
| `GET /api/game/:id/players` | Returns the normalized roster for the selected game. |
| `GET /api/game/:id/stats` | Returns the latest normalized per-player stats snapshot along with clock metadata. |

Socket.IO emits `stats:update` whenever fresh data arrives for a subscribed game.

## Testing

A small Vitest suite exercises the stat normalization logic:

```bash
npm run test --workspace server
```

## Notes & guardrails

- The server uses polite polling with jitter and exponential backoff on errors.
- All data is cached in-memory; no external database is required.
- Normalization handles missing/null fields defensively and logs warnings instead of crashing.
- Goals are stored in browser `localStorage` so they persist across refreshes.

Enjoy tracking your favorite players!
