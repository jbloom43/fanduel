import { haveStatsChanged } from './normalizers.js';
import { logger } from './logger.js';
import { GameClock, GamePayload, NormalizedGameStats, PollResult } from './types.js';

type Listener = (payload: GamePayload) => void;

type GameState = {
  listeners: Set<Listener>;
  timer?: NodeJS.Timeout;
  fetching: boolean;
  lastStats?: NormalizedGameStats;
  lastClock?: GameClock | null;
  backoffMs: number;
};

type Fetcher = (gameId: string) => Promise<PollResult>;

const jitter = (base: number) => Math.floor(Math.random() * base);

export class GamePoller {
  private readonly states = new Map<string, GameState>();

  constructor(private readonly fetcher: Fetcher, private readonly intervalMs: number) {}

  private ensureState(gameId: string): GameState {
    let state = this.states.get(gameId);
    if (!state) {
      state = {
        listeners: new Set<Listener>(),
        fetching: false,
        backoffMs: this.intervalMs
      };
      this.states.set(gameId, state);
    }
    return state;
  }

  subscribe(gameId: string, listener: Listener): () => void {
    const state = this.ensureState(gameId);
    state.listeners.add(listener);
    if (!state.timer) {
      this.schedule(gameId, 0);
    }
    if (state.lastStats) {
      listener({ stats: state.lastStats, clock: state.lastClock });
    }
    return () => {
      this.unsubscribe(gameId, listener);
    };
  }

  private unsubscribe(gameId: string, listener: Listener) {
    const state = this.states.get(gameId);
    if (!state) return;
    state.listeners.delete(listener);
    if (state.listeners.size === 0) {
      if (state.timer) {
        clearTimeout(state.timer);
        state.timer = undefined;
      }
    }
  }

  async getSnapshot(gameId: string): Promise<GamePayload> {
    const state = this.ensureState(gameId);
    if (!state.lastStats) {
      const payload = await this.executeFetch(gameId, state);
      if (payload) {
        return payload;
      }
    }
    return { stats: state.lastStats ?? {}, clock: state.lastClock };
  }

  private schedule(gameId: string, delay: number) {
    const state = this.ensureState(gameId);
    if (state.timer) {
      clearTimeout(state.timer);
    }
    const scheduleDelay = Math.max(0, delay) + jitter(Math.min(1000, this.intervalMs));
    state.timer = setTimeout(() => {
      this.poll(gameId).catch((error) => {
        logger.error('Poll loop crashed', error);
      });
    }, scheduleDelay);
  }

  private async poll(gameId: string) {
    const state = this.ensureState(gameId);
    if (state.fetching) return;
    const payload = await this.executeFetch(gameId, state);
    const delay = payload ? this.intervalMs : Math.min(state.backoffMs * 2, this.intervalMs * 12);
    state.backoffMs = payload ? this.intervalMs : delay;
    this.schedule(gameId, delay);
  }

  private async executeFetch(gameId: string, state: GameState): Promise<GamePayload | null> {
    if (state.fetching) return null;
    state.fetching = true;
    try {
      const result = await this.fetcher(gameId);
      const { stats, clock } = result;
      const hasChanged = haveStatsChanged(state.lastStats, stats, state.lastClock, clock ?? null);
      state.lastStats = stats;
      state.lastClock = clock ?? null;
      if (hasChanged) {
        const payload: GamePayload = { stats, clock: state.lastClock };
        for (const listener of state.listeners) {
          try {
            listener(payload);
          } catch (listenerError) {
            logger.warn('Listener threw while handling poll payload', listenerError);
          }
        }
        return payload;
      }
      return { stats: state.lastStats ?? {}, clock: state.lastClock };
    } catch (error) {
      logger.warn(`Poll for game ${gameId} failed`, error);
      return null;
    } finally {
      state.fetching = false;
    }
  }
}
