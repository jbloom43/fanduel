/*
 * NOTE: ESPN JSON endpoints used in this adapter are undocumented and are consumed here
 * strictly for personal, non-commercial hobby use. The payloads may change or become
 * unavailable at any time. For production applications, replace this adapter with a
 * licensed data provider.
 */
import { logger } from './logger.js';
import {
  normalizeGameSummaries,
  normalizePlayersFromGamePackage,
  normalizeStatsFromGamePackage,
  extractClockFromStatus
} from './normalizers.js';
import { AthleteInfo, GameClock, GameSummary, NormalizedGameStats, PollResult } from './types.js';

const SCOREBOARD_URL = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';
const GAME_PACKAGE_URL = (gameId: string) => `https://cdn.espn.com/core/nfl/game?gameId=${gameId}&xhr=1`;

const DEFAULT_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Safari/605.1.15',
  Accept: 'application/json, text/plain, */*'
};

const CACHE_TTL_MS = 60 * 1000;

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

type MockState = {
  game: GameSummary;
  players: Record<string, AthleteInfo>;
  stats: NormalizedGameStats;
  clock: GameClock | null;
  lastTick: number;
};

const formatDateForScoreboard = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}${month}${day}`;
};

const cloneStats = (stats: NormalizedGameStats): NormalizedGameStats =>
  JSON.parse(JSON.stringify(stats ?? {}));

export class ESPNAdapter {
  private scoreboardCache: CacheEntry<GameSummary[]> | null = null;
  private readonly playerCache = new Map<string, CacheEntry<Record<string, AthleteInfo>>>();
  private readonly mockState = new Map<string, MockState>();
  private readonly useMocks = String(process.env.USE_MOCKS).toLowerCase() === 'true';

  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async getTonightGames(): Promise<GameSummary[]> {
    if (this.useMocks) {
      return this.getMockGames();
    }
    if (this.scoreboardCache && this.scoreboardCache.expiresAt > Date.now()) {
      return this.scoreboardCache.value;
    }
    const now = new Date();
    const url = `${SCOREBOARD_URL}?limit=200&dates=${formatDateForScoreboard(now)}`;
    try {
      const json = await this.getJson(url);
      const games = normalizeGameSummaries(json);
      this.scoreboardCache = { expiresAt: Date.now() + CACHE_TTL_MS, value: games };
      return games;
    } catch (error) {
      logger.warn('Failed to fetch scoreboard', error);
      return [];
    }
  }

  async getGamePlayers(gameId: string): Promise<Record<string, AthleteInfo>> {
    if (this.useMocks) {
      const state = this.ensureMockState(gameId);
      return state.players;
    }
    const cached = this.playerCache.get(gameId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }
    const gamePackage = await this.fetchGamePackage(gameId);
    const players = normalizePlayersFromGamePackage(gamePackage);
    this.playerCache.set(gameId, { expiresAt: Date.now() + CACHE_TTL_MS, value: players });
    return players;
  }

  async getGameData(gameId: string): Promise<PollResult> {
    if (this.useMocks) {
      const state = this.ensureMockState(gameId);
      this.tickMockState(state);
      return {
        stats: cloneStats(state.stats),
        players: state.players,
        clock: state.clock,
        raw: null
      };
    }
    const gamePackage = await this.fetchGamePackage(gameId);
    const players = normalizePlayersFromGamePackage(gamePackage);
    this.playerCache.set(gameId, { expiresAt: Date.now() + CACHE_TTL_MS, value: players });
    const stats = normalizeStatsFromGamePackage(gamePackage);
    const status = gamePackage?.header?.competitions?.[0]?.status;
    const clock = extractClockFromStatus(status);
    return {
      stats,
      players,
      clock,
      raw: gamePackage
    };
  }

  private async fetchGamePackage(gameId: string): Promise<any> {
    const url = GAME_PACKAGE_URL(gameId);
    const json = await this.getJson(url);
    if (json?.gamepackageJSON) {
      return json.gamepackageJSON;
    }
    return json;
  }

  private async getJson(url: string): Promise<any> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await this.fetchImpl(url, {
        headers: DEFAULT_HEADERS,
        signal: controller.signal
      });
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`Request failed ${response.status} ${response.statusText}: ${body.slice(0, 120)}`);
      }
      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  private getMockGames(): GameSummary[] {
    return [
      {
        id: 'mock-game-1',
        homeTeam: 'TB',
        awayTeam: 'CAR',
        startTime: new Date().toISOString()
      }
    ];
  }

  private ensureMockState(gameId: string): MockState {
    let state = this.mockState.get(gameId);
    if (!state) {
      const players: Record<string, AthleteInfo> = {
        '1001': { athleteId: '1001', fullName: 'Baker Mayfield', team: 'TB', position: 'QB' },
        '1002': { athleteId: '1002', fullName: 'Rachaad White', team: 'TB', position: 'RB' },
        '1003': { athleteId: '1003', fullName: 'Mike Evans', team: 'TB', position: 'WR' },
        '1004': { athleteId: '1004', fullName: 'Chris Godwin', team: 'TB', position: 'WR' },
        '2001': { athleteId: '2001', fullName: 'Bryce Young', team: 'CAR', position: 'QB' },
        '2002': { athleteId: '2002', fullName: 'Adam Thielen', team: 'CAR', position: 'WR' }
      };
      const stats: NormalizedGameStats = {};
      for (const id of Object.keys(players)) {
        stats[id] = {
          passingAttempts: 0,
          passingCompletions: 0,
          passingYards: 0,
          passingTD: 0,
          interceptions: 0,
          rushingCarries: 0,
          rushingYards: 0,
          rushingTD: 0,
          receivingTargets: 0,
          receivingReceptions: 0,
          receivingYards: 0,
          receivingTD: 0
        };
      }
      state = {
        game: this.getMockGames()[0],
        players,
        stats,
        clock: {
          displayClock: '15:00',
          period: 1,
          totalSecondsRemaining: 60 * 60
        },
        lastTick: Date.now()
      };
      this.mockState.set(gameId, state);
    }
    return state;
  }

  private tickMockState(state: MockState) {
    const now = Date.now();
    if (now - state.lastTick < 3000) {
      return;
    }
    state.lastTick = now;
    const qb = state.stats['1001'];
    const rb = state.stats['1002'];
    const wr1 = state.stats['1003'];
    const wr2 = state.stats['1004'];
    const oppQb = state.stats['2001'];
    const oppWr = state.stats['2002'];

    // Passing production
    const passYards = Math.floor(Math.random() * 40);
    qb.passingYards += passYards;
    qb.passingAttempts += Math.max(1, Math.floor(passYards / 8));
    qb.passingCompletions += Math.max(1, Math.floor(passYards / 12));
    if (Math.random() < 0.1) {
      qb.passingTD += 1;
    }

    const oppPassYards = Math.floor(Math.random() * 35);
    oppQb.passingYards += oppPassYards;
    oppQb.passingAttempts += Math.max(1, Math.floor(oppPassYards / 7));
    oppQb.passingCompletions += Math.max(1, Math.floor(oppPassYards / 10));
    if (Math.random() < 0.08) {
      oppQb.passingTD += 1;
    }

    // Rushing
    const rushGain = Math.floor(Math.random() * 12);
    rb.rushingYards += rushGain;
    rb.rushingCarries += 1;
    if (Math.random() < 0.08) {
      rb.rushingTD += 1;
    }

    // Receiving
    const wrGain = Math.floor(Math.random() * 35);
    wr1.receivingYards += wrGain;
    wr1.receivingReceptions += wrGain > 0 ? 1 : 0;
    wr1.receivingTargets += 1;
    if (Math.random() < 0.1) {
      wr1.receivingTD += 1;
    }

    const wr2Gain = Math.floor(Math.random() * 25);
    wr2.receivingYards += wr2Gain;
    wr2.receivingReceptions += wr2Gain > 0 ? 1 : 0;
    wr2.receivingTargets += 1;

    const oppWrGain = Math.floor(Math.random() * 30);
    oppWr.receivingYards += oppWrGain;
    oppWr.receivingReceptions += oppWrGain > 0 ? 1 : 0;
    oppWr.receivingTargets += 1;
    if (Math.random() < 0.07) {
      oppWr.receivingTD += 1;
      oppQb.passingTD += 1;
    }

    // Clock handling
    if (state.clock) {
      const decrement = Math.floor(Math.random() * 30) + 10;
      const remaining = Math.max(0, (state.clock.totalSecondsRemaining ?? 0) - decrement);
      state.clock.totalSecondsRemaining = remaining;
      if (remaining <= 0) {
        state.clock.displayClock = '0:00';
        state.clock.period = 4;
      } else {
        const regulation = 15 * 60;
        const quartersRemaining = Math.ceil(remaining / regulation);
        const period = Math.max(1, Math.min(4, 5 - quartersRemaining));
        const secondsInQuarter = remaining - Math.max(0, (quartersRemaining - 1) * regulation);
        const minutes = Math.floor(secondsInQuarter / 60);
        const seconds = secondsInQuarter % 60;
        state.clock.period = period;
        state.clock.displayClock = `${minutes}:${seconds.toString().padStart(2, '0')}`;
      }
    }
  }
}

export const espnAdapter = new ESPNAdapter();
