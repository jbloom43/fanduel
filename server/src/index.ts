import { config } from 'dotenv';
import cors from 'cors';
import express from 'express';
import { createServer } from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { espnAdapter } from './espnAdapter.js';
import { GamePoller } from './poller.js';
import { registerSockets } from './sockets.js';
import { logger } from './logger.js';

config();

const PORT = Number(process.env.PORT ?? 3001);
const POLL_MS = Number(process.env.POLL_MS ?? 5000);

const app = express();
app.use(cors());
app.use(express.json());

const poller = new GamePoller((gameId) => espnAdapter.getGameData(gameId), POLL_MS);

app.get('/api/games/tonight', async (_req, res) => {
  try {
    const games = await espnAdapter.getTonightGames();
    res.json({ games });
  } catch (error) {
    logger.error('Failed to return tonight games', error);
    res.status(500).json({ error: 'Failed to load games' });
  }
});

app.get('/api/game/:id/players', async (req, res) => {
  const gameId = String(req.params.id);
  if (!gameId) {
    res.status(400).json({ error: 'Game ID required' });
    return;
  }
  try {
    const players = await espnAdapter.getGamePlayers(gameId);
    res.json({ players: Object.values(players) });
  } catch (error) {
    logger.error('Failed to load players for game', gameId, error);
    res.status(500).json({ error: 'Failed to load players' });
  }
});

app.get('/api/game/:id/stats', async (req, res) => {
  const gameId = String(req.params.id);
  if (!gameId) {
    res.status(400).json({ error: 'Game ID required' });
    return;
  }
  try {
    const snapshot = await poller.getSnapshot(gameId);
    res.json({ stats: snapshot.stats, clock: snapshot.clock, updatedAt: new Date().toISOString() });
  } catch (error) {
    logger.error('Failed to load stats for game', gameId, error);
    res.status(500).json({ error: 'Failed to load stats' });
  }
});

const httpServer = createServer(app);
registerSockets(httpServer, poller);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const staticDir = path.resolve(__dirname, '../public');

if (fs.existsSync(staticDir)) {
  app.use(express.static(staticDir));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(staticDir, 'index.html'));
  });
}

httpServer.listen(PORT, () => {
  logger.info(`Server listening on port ${PORT}`);
});
