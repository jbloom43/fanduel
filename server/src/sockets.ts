import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { GamePoller } from './poller.js';
import { logger } from './logger.js';

export type SocketServer = Server;

export const registerSockets = (httpServer: HttpServer, poller: GamePoller): SocketServer => {
  const io = new Server(httpServer, {
    cors: {
      origin: '*'
    }
  });

  io.on('connection', (socket) => {
    logger.info('Socket connected', socket.id);
    let unsubscribe: (() => void) | null = null;

    socket.on('joinGame', (gameId: string) => {
      if (!gameId) return;
      logger.info(`Socket ${socket.id} joining game`, gameId);
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
      unsubscribe = poller.subscribe(gameId, (payload) => {
        socket.emit('stats:update', {
          gameId,
          ...payload,
          updatedAt: new Date().toISOString()
        });
      });
    });

    socket.on('disconnect', () => {
      logger.info('Socket disconnected', socket.id);
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
    });
  });

  return io;
};
