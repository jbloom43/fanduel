import {
  AthleteInfo,
  GameClock,
  GameSummary,
  NormalizedGameStats,
  NormalizedPlayerStats
} from './types.js';
import { logger } from './logger.js';

const REGULATION_PERIODS = 4;

export const emptyStats = (): NormalizedPlayerStats => ({
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
});

const PASSING_COMPLETIONS_LABELS = ['C/ATT', 'CMP/ATT', 'COM/ATT'];
const PASSING_YARDS_LABELS = ['YDS', 'YDS.'];
const PASSING_TD_LABELS = ['TD'];
const PASSING_INT_LABELS = ['INT'];

const RUSHING_ATTEMPTS_LABELS = ['CAR', 'ATT'];
const RUSHING_YARDS_LABELS = ['YDS'];
const RUSHING_TD_LABELS = ['TD'];

const RECEIVING_RECEPTIONS_LABELS = ['REC'];
const RECEIVING_TARGETS_LABELS = ['TGTS', 'TAR', 'TGT'];
const RECEIVING_YARDS_LABELS = ['YDS'];
const RECEIVING_TD_LABELS = ['TD'];

const toUpper = (value: unknown): string => String(value ?? '').toUpperCase();

const sanitizeNumber = (value: unknown): number => {
  if (value == null) return 0;
  const asString = String(value);
  const numericPart = asString.replace(/[^0-9+-.]/g, '');
  const num = Number(numericPart);
  return Number.isFinite(num) ? num : 0;
};

const parseCompletionAttempt = (value: unknown): { completions?: number; attempts?: number } => {
  if (value == null) return {};
  const asString = String(value);
  const parts = asString.split(/[\\/-]/);
  if (parts.length < 2) return {};
  const completions = Number(parts[0]);
  const attempts = Number(parts[1]);
  return {
    completions: Number.isFinite(completions) ? completions : undefined,
    attempts: Number.isFinite(attempts) ? attempts : undefined
  };
};

const getStatValue = (
  labels: unknown[] | undefined,
  stats: unknown[] | undefined,
  possibleLabels: string[]
): unknown => {
  if (!Array.isArray(labels) || !Array.isArray(stats)) return undefined;
  for (let i = 0; i < labels.length; i += 1) {
    const label = toUpper(labels[i]);
    if (possibleLabels.includes(label)) {
      return stats[i];
    }
  }
  return undefined;
};

const ensureStatsEntry = (
  map: NormalizedGameStats,
  athleteId: string
): NormalizedPlayerStats => {
  if (!map[athleteId]) {
    map[athleteId] = emptyStats();
  }
  return map[athleteId];
};

export const normalizeGameSummaries = (payload: any): GameSummary[] => {
  const events: any[] = Array.isArray(payload?.events) ? payload.events : [];
  const now = new Date();
  return events
    .map((event) => {
      const competition = Array.isArray(event?.competitions) ? event.competitions[0] : undefined;
      const competitors: any[] = Array.isArray(competition?.competitors) ? competition.competitors : [];
      const home = competitors.find((c) => c?.homeAway === 'home') ?? competitors[0];
      const away = competitors.find((c) => c?.homeAway === 'away') ?? competitors[1];
      const startDate = competition?.date ? new Date(competition.date) : event?.date ? new Date(event.date) : null;
      const status = competition?.status ?? event?.status;
      const state = status?.type?.state ?? status?.type?.name;
      const isOngoing = state === 'in' || state === 'postponed' || state === 'delayed';
      const isToday = startDate ? startDate.toDateString() === now.toDateString() : false;
      if (!startDate || (!isToday && !isOngoing)) {
        return null;
      }
      return {
        id: String(event?.id ?? competition?.id ?? competition?.uid ?? ''),
        homeTeam:
          home?.team?.abbreviation ?? home?.team?.shortDisplayName ?? home?.team?.displayName ?? 'Home',
        awayTeam:
          away?.team?.abbreviation ?? away?.team?.shortDisplayName ?? away?.team?.displayName ?? 'Away',
        startTime: startDate.toISOString()
      } satisfies GameSummary;
    })
    .filter((game): game is GameSummary => Boolean(game));
};

export const normalizePlayersFromGamePackage = (gamePackage: any): Record<string, AthleteInfo> => {
  const playersBlock: any[] = Array.isArray(gamePackage?.boxscore?.players)
    ? gamePackage.boxscore.players
    : [];
  const roster: Record<string, AthleteInfo> = {};
  for (const teamBlock of playersBlock) {
    const teamAbbr =
      teamBlock?.team?.abbreviation ?? teamBlock?.team?.shortDisplayName ?? teamBlock?.team?.displayName ?? 'UNK';
    const statistics: any[] = Array.isArray(teamBlock?.statistics) ? teamBlock.statistics : [];
    for (const stat of statistics) {
      const athletes: any[] = Array.isArray(stat?.athletes)
        ? stat.athletes
        : Array.isArray(stat?.statistics)
          ? stat.statistics
          : [];
      for (const athleteStat of athletes) {
        const athlete = athleteStat?.athlete ?? athleteStat;
        const athleteId = String(
          athlete?.id ?? athlete?.athleteId ?? athleteStat?.athleteId ?? athleteStat?.id ?? ''
        );
        if (!athleteId) continue;
        if (!roster[athleteId]) {
          roster[athleteId] = {
            athleteId,
            fullName: athlete?.displayName ?? athlete?.fullName ?? athleteStat?.displayName ?? 'Unknown Player',
            team: teamAbbr,
            position:
              athlete?.position?.abbreviation ??
              athlete?.position?.displayName ??
              athleteStat?.position ??
              'N/A'
          } satisfies AthleteInfo;
        }
      }
    }
  }
  return roster;
};

const applyPassingStats = (
  entry: NormalizedPlayerStats,
  labels: unknown[] | undefined,
  stats: unknown[] | undefined
) => {
  const completionString = getStatValue(labels, stats, PASSING_COMPLETIONS_LABELS);
  const { completions, attempts } = parseCompletionAttempt(completionString);
  if (typeof completions === 'number') entry.passingCompletions = completions;
  if (typeof attempts === 'number') entry.passingAttempts = attempts;
  const yards = sanitizeNumber(getStatValue(labels, stats, PASSING_YARDS_LABELS));
  if (yards) entry.passingYards = yards;
  const tds = sanitizeNumber(getStatValue(labels, stats, PASSING_TD_LABELS));
  if (tds) entry.passingTD = tds;
  const ints = sanitizeNumber(getStatValue(labels, stats, PASSING_INT_LABELS));
  if (ints) entry.interceptions = ints;
};

const applyRushingStats = (
  entry: NormalizedPlayerStats,
  labels: unknown[] | undefined,
  stats: unknown[] | undefined
) => {
  const attempts = sanitizeNumber(getStatValue(labels, stats, RUSHING_ATTEMPTS_LABELS));
  if (attempts) entry.rushingCarries = attempts;
  const yards = sanitizeNumber(getStatValue(labels, stats, RUSHING_YARDS_LABELS));
  if (yards) entry.rushingYards = yards;
  const tds = sanitizeNumber(getStatValue(labels, stats, RUSHING_TD_LABELS));
  if (tds) entry.rushingTD = tds;
};

const applyReceivingStats = (
  entry: NormalizedPlayerStats,
  labels: unknown[] | undefined,
  stats: unknown[] | undefined
) => {
  const receptions = sanitizeNumber(getStatValue(labels, stats, RECEIVING_RECEPTIONS_LABELS));
  if (receptions) entry.receivingReceptions = receptions;
  const targets = sanitizeNumber(getStatValue(labels, stats, RECEIVING_TARGETS_LABELS));
  if (targets) entry.receivingTargets = targets;
  const yards = sanitizeNumber(getStatValue(labels, stats, RECEIVING_YARDS_LABELS));
  if (yards) entry.receivingYards = yards;
  const tds = sanitizeNumber(getStatValue(labels, stats, RECEIVING_TD_LABELS));
  if (tds) entry.receivingTD = tds;
};

export const normalizeStatsFromGamePackage = (gamePackage: any): NormalizedGameStats => {
  const map: NormalizedGameStats = {};
  const playersBlock: any[] = Array.isArray(gamePackage?.boxscore?.players)
    ? gamePackage.boxscore.players
    : [];
  for (const teamBlock of playersBlock) {
    const statistics: any[] = Array.isArray(teamBlock?.statistics) ? teamBlock.statistics : [];
    for (const stat of statistics) {
      const labelSource: unknown[] | undefined = Array.isArray(stat?.labels) ? stat.labels : undefined;
      const athletes: any[] = Array.isArray(stat?.athletes)
        ? stat.athletes
        : Array.isArray(stat?.statistics)
          ? stat.statistics
          : [];
      for (const athleteStat of athletes) {
        const athlete = athleteStat?.athlete ?? athleteStat;
        const athleteId = String(
          athlete?.id ?? athlete?.athleteId ?? athleteStat?.athleteId ?? athleteStat?.id ?? ''
        );
        if (!athleteId) continue;
        const entry = ensureStatsEntry(map, athleteId);
        const values: unknown[] | undefined = Array.isArray(athleteStat?.stats)
          ? athleteStat.stats
          : Array.isArray(athleteStat?.statistics)
            ? athleteStat.statistics
            : undefined;
        const category = String(stat?.name ?? stat?.abbreviation ?? '').toLowerCase();
        try {
          if (category.includes('pass')) {
            applyPassingStats(entry, labelSource, values);
          } else if (category.includes('rush')) {
            applyRushingStats(entry, labelSource, values);
          } else if (category.includes('receiv')) {
            applyReceivingStats(entry, labelSource, values);
          }
        } catch (error) {
          logger.warn('Failed to normalize stats for athlete', athleteId, error);
        }
      }
    }
  }

  // Ensure every discovered athlete has at least an empty stats entry
  const roster = normalizePlayersFromGamePackage(gamePackage);
  for (const athleteId of Object.keys(roster)) {
    ensureStatsEntry(map, athleteId);
  }

  return map;
};

const parseClock = (displayClock: string | undefined): number | null => {
  if (!displayClock) return null;
  if (displayClock.toUpperCase() === 'HALF') return 15 * 60 * 2;
  const match = displayClock.match(/(\d+):(\d+)(?:\.(\d+))?/);
  if (!match) return null;
  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) return null;
  return minutes * 60 + seconds;
};

export const extractClockFromStatus = (status: any): GameClock | null => {
  if (!status) return null;
  const displayClock = String(status?.displayClock ?? '');
  const periodValue = Number(status?.period ?? status?.quarter ?? 0) || 0;
  let secondsRemaining: number | null = null;
  if (typeof status?.clock === 'number' && Number.isFinite(status.clock)) {
    secondsRemaining = status.clock;
  } else {
    secondsRemaining = parseClock(displayClock);
  }
  let totalSecondsRemaining: number | null = null;
  if (secondsRemaining != null) {
    if (periodValue <= REGULATION_PERIODS) {
      const remainingPeriods = Math.max(0, REGULATION_PERIODS - periodValue);
      totalSecondsRemaining = secondsRemaining + remainingPeriods * 15 * 60;
    } else {
      totalSecondsRemaining = secondsRemaining;
    }
  }
  return {
    displayClock,
    period: periodValue,
    totalSecondsRemaining: totalSecondsRemaining != null ? Math.max(0, Math.floor(totalSecondsRemaining)) : null
  };
};

export const haveStatsChanged = (
  prev: NormalizedGameStats | undefined,
  next: NormalizedGameStats | undefined,
  prevClock: GameClock | null | undefined,
  nextClock: GameClock | null | undefined
): boolean => {
  const prevKey = JSON.stringify(prev ?? {});
  const nextKey = JSON.stringify(next ?? {});
  if (prevKey !== nextKey) return true;
  const prevClockKey = JSON.stringify(prevClock ?? {});
  const nextClockKey = JSON.stringify(nextClock ?? {});
  return prevClockKey !== nextClockKey;
};
