export type StatKey =
  | 'passingYards'
  | 'rushingYards'
  | 'receivingYards'
  | 'passingTD'
  | 'rushingTD'
  | 'receivingTD';

export type GameSummary = {
  id: string;
  homeTeam: string;
  awayTeam: string;
  startTime: string;
};

export type Athlete = {
  athleteId: string;
  fullName: string;
  team: string;
  position: string;
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

export type GameClock = {
  displayClock: string;
  period: number;
  totalSecondsRemaining: number | null;
};

export type StatsResponse = {
  stats: Record<string, NormalizedPlayerStats>;
  clock: GameClock | null;
  updatedAt: string;
};

export type Goal = {
  athleteId: string;
  displayName: string;
  statKey: StatKey;
  goalValue: number;
};
