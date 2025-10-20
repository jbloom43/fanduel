export type GameSummary = {
  id: string;
  homeTeam: string;
  awayTeam: string;
  startTime: string;
};

export type AthleteInfo = {
  athleteId: string;
  fullName: string;
  team: string;
  position: string;
};

export type PlayerStatSnapshot = {
  athlete: AthleteInfo;
  stats: NormalizedPlayerStats;
};

export type NormalizedPlayerStats = {
  passingAttempts: number;
  passingCompletions: number;
  passingYards: number;
  passingTD: number;
  interceptions: number;
  rushingCarries: number;
  rushingYards: number;
  rushingTD: number;
  receivingTargets: number;
  receivingReceptions: number;
  receivingYards: number;
  receivingTD: number;
};

export type NormalizedGameStats = Record<string, NormalizedPlayerStats>;

export type GameClock = {
  displayClock: string;
  period: number;
  totalSecondsRemaining: number | null;
};

export type GamePayload = {
  stats: NormalizedGameStats;
  clock?: GameClock | null;
};

export type PollResult = {
  stats: NormalizedGameStats;
  players: Record<string, AthleteInfo>;
  clock?: GameClock | null;
  raw?: unknown;
};
