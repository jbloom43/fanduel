import { useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import confetti from 'canvas-confetti';
import GoalCard from './components/GoalCard';
import type {
  Athlete,
  GameClock,
  GameSummary,
  Goal,
  NormalizedPlayerStats,
  StatKey
} from './types';

const STORAGE_KEY = 'nfl-goal-tracker-goals';
const TOTAL_GAME_SECONDS = 60 * 60;
const API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? (import.meta.env.DEV ? 'http://localhost:3001' : '');

const STAT_OPTIONS: { key: StatKey; label: string }[] = [
  { key: 'passingYards', label: 'Passing Yards' },
  { key: 'passingTD', label: 'Passing TDs' },
  { key: 'rushingYards', label: 'Rushing Yards' },
  { key: 'rushingTD', label: 'Rushing TDs' },
  { key: 'receivingYards', label: 'Receiving Yards' },
  { key: 'receivingTD', label: 'Receiving TDs' }
];

type StatsMap = Record<string, NormalizedPlayerStats>;

const goalKey = (goal: Goal) => `${goal.athleteId}-${goal.statKey}-${goal.goalValue}`;

const fetchJson = async <T,>(path: string): Promise<T> => {
  const base = API_BASE ?? '';
  const url = `${base}${path}`;
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json();
};

const usePersistentGoals = () => {
  const [goals, setGoals] = useState<Goal[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      return stored ? (JSON.parse(stored) as Goal[]) : [];
    } catch (error) {
      console.warn('Failed to read stored goals', error);
      return [];
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(goals));
    } catch (error) {
      console.warn('Failed to persist goals', error);
    }
  }, [goals]);

  return [goals, setGoals] as const;
};

function App() {
  const [games, setGames] = useState<GameSummary[]>([]);
  const [gamesLoading, setGamesLoading] = useState(false);
  const [selectedGame, setSelectedGame] = useState<string>('');
  const [players, setPlayers] = useState<Athlete[]>([]);
  const [playerSearch, setPlayerSearch] = useState('');
  const [goals, setGoals] = usePersistentGoals();
  const [stats, setStats] = useState<StatsMap>({});
  const [clock, setClock] = useState<GameClock | null>(null);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const [statKey, setStatKey] = useState<StatKey>('passingYards');
  const [goalValue, setGoalValue] = useState<number>(100);
  const [selectedAthleteId, setSelectedAthleteId] = useState<string>('');
  const [hitGoals, setHitGoals] = useState<Set<string>>(new Set());

  useEffect(() => {
    setGamesLoading(true);
    fetchJson<{ games: GameSummary[] }>('/api/games/tonight')
      .then((data) => {
        setGames(data.games);
        if (data.games.length > 0 && !selectedGame) {
          setSelectedGame(data.games[0].id);
        }
      })
      .catch((err) => {
        console.error(err);
        setError('Unable to load tonight\'s games. Try mock mode (USE_MOCKS=true) if needed.');
      })
      .finally(() => setGamesLoading(false));
  }, []);

  useEffect(() => {
    if (!error) return;
    const timeout = window.setTimeout(() => setError(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [error]);

  useEffect(() => {
    setHitGoals((previous) => {
      const next = new Set<string>();
      for (const goal of goals) {
        const key = goalKey(goal);
        if (previous.has(key)) {
          next.add(key);
        }
      }
      return next;
    });
  }, [goals]);

  const playersById = useMemo(() => {
    const map: Record<string, Athlete> = {};
    for (const player of players) {
      map[player.athleteId] = player;
    }
    return map;
  }, [players]);

  useEffect(() => {
    if (!selectedGame) return;

    let cancelled = false;

    const loadPlayersAndStats = async () => {
      try {
        const [{ players: roster }, statsResponse] = await Promise.all([
          fetchJson<{ players: Athlete[] }>(`/api/game/${selectedGame}/players`),
          fetchJson<{ stats: StatsMap; clock: GameClock | null }>(`/api/game/${selectedGame}/stats`)
        ]);
        if (cancelled) return;
        setPlayers(roster);
        setStats(statsResponse.stats ?? {});
        setClock(statsResponse.clock ?? null);
      } catch (err) {
        console.error(err);
        setError('Failed to load game data.');
      }
    };

    loadPlayersAndStats();

    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    const socketUrl = API_BASE || window.location.origin;
    const socket = io(socketUrl, {
      transports: ['websocket'],
      autoConnect: true
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('joinGame', selectedGame);
    });

    socket.on('stats:update', (payload: { gameId: string; stats: StatsMap; clock: GameClock | null }) => {
      if (payload.gameId !== selectedGame) return;
      setStats(payload.stats ?? {});
      setClock(payload.clock ?? null);
    });

    socket.on('connect_error', () => {
      setError('Live connection failed. Retrying...');
    });

    return () => {
      cancelled = true;
      socket.disconnect();
    };
  }, [selectedGame]);

  useEffect(() => {
    if (!goals.length) return;
    setHitGoals((previous) => {
      let changed = false;
      const next = new Set(previous);
      for (const goal of goals) {
        const key = goalKey(goal);
        const currentValue = stats[goal.athleteId]?.[goal.statKey] ?? 0;
        if (currentValue >= goal.goalValue && !next.has(key)) {
          next.add(key);
          changed = true;
          confetti({
            particleCount: 120,
            spread: 70,
            origin: { y: 0.6 }
          });
        }
      }
      return changed ? next : previous;
    });
  }, [stats, goals]);

  const filteredPlayers = useMemo(() => {
    if (!playerSearch.trim()) return players;
    const lower = playerSearch.toLowerCase();
    return players.filter((player) => player.fullName.toLowerCase().includes(lower));
  }, [playerSearch, players]);

  const handleAddGoal = () => {
    const player = playersById[selectedAthleteId];
    if (!player) {
      setError('Please select a player.');
      return;
    }
    if (!goalValue || goalValue <= 0) {
      setError('Goal value must be greater than zero.');
      return;
    }
    const newGoal: Goal = {
      athleteId: player.athleteId,
      displayName: player.fullName,
      statKey,
      goalValue: Math.round(goalValue)
    };
    setGoals((current) => [...current, newGoal]);
    setSelectedAthleteId('');
  };

  const removeGoal = (goalToRemove: Goal) => {
    setGoals((current) => current.filter((goal) => goal !== goalToRemove));
  };

  const computeOnPace = (currentValue: number, target: number): boolean | null => {
    if (!clock || clock.totalSecondsRemaining == null) return null;
    if (clock.totalSecondsRemaining <= 0) {
      return currentValue >= target;
    }
    const elapsed = TOTAL_GAME_SECONDS - clock.totalSecondsRemaining;
    if (elapsed <= 0) return null;
    const ratePerSecond = currentValue / elapsed;
    if (!Number.isFinite(ratePerSecond)) return null;
    const projected = ratePerSecond * TOTAL_GAME_SECONDS;
    return projected >= target;
  };

  const goalsWithData = goals.map((goal) => {
    const player = playersById[goal.athleteId];
    const playerStats = stats[goal.athleteId];
    const currentValue = playerStats ? (playerStats[goal.statKey] as number) ?? 0 : 0;
    const progressPct = goal.goalValue > 0 ? (currentValue / goal.goalValue) * 100 : 0;
    const achieved = currentValue >= goal.goalValue;
    const onPace = computeOnPace(currentValue, goal.goalValue);
    return { goal, player, currentValue, progressPct, achieved, onPace };
  });

  const selectedGameMeta = games.find((game) => game.id === selectedGame);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-6 py-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white sm:text-3xl">NFL Goal Tracker</h1>
            <p className="text-sm text-slate-300">
              Track your favorite players and see how close they are to smashing tonight&apos;s goals.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:w-80">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">Select game</label>
            <select
              value={selectedGame}
              onChange={(event) => setSelectedGame(event.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
            >
              {gamesLoading && <option>Loading games...</option>}
              {!gamesLoading && games.length === 0 && <option>No games found</option>}
              {games.map((game) => (
                <option key={game.id} value={game.id}>
                  {game.awayTeam} @ {game.homeTeam}
                </option>
              ))}
            </select>
            {selectedGameMeta && (
              <p className="text-xs text-slate-400">
                Kickoff: {new Date(selectedGameMeta.startTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
              </p>
            )}
          </div>
        </div>
      </header>

      {error && (
        <div className="fixed right-6 top-6 z-30 w-72 rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100 shadow-lg">
          {error}
        </div>
      )}

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 py-8">
        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-lg backdrop-blur">
          <h2 className="text-lg font-semibold text-white">Add a goal</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-4">
            <div className="md:col-span-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">Search player</label>
              <input
                type="text"
                value={playerSearch}
                onChange={(event) => setPlayerSearch(event.target.value)}
                placeholder="Type a name..."
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
              />
              <select
                value={selectedAthleteId}
                onChange={(event) => setSelectedAthleteId(event.target.value)}
                className="mt-3 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
              >
                <option value="">Choose player</option>
                {filteredPlayers.map((player) => (
                  <option key={player.athleteId} value={player.athleteId}>
                    {player.fullName} · {player.team} {player.position}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">Stat</label>
              <select
                value={statKey}
                onChange={(event) => setStatKey(event.target.value as StatKey)}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
              >
                {STAT_OPTIONS.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">Goal value</label>
              <input
                type="number"
                min={1}
                value={goalValue}
                onChange={(event) => setGoalValue(Number(event.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleAddGoal}
                className="mt-3 w-full rounded-lg bg-sky-500 px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-sky-400"
              >
                Add goal
              </button>
            </div>
          </div>
        </section>

        {goals.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 p-12 text-center text-slate-400">
            Add a player goal to get started. Goals are stored locally so they stick around between refreshes.
          </div>
        ) : (
          <section className="grid gap-6 md:grid-cols-2">
            {goalsWithData.map(({ goal, player, currentValue, progressPct, achieved, onPace }) => (
              <GoalCard
                key={goalKey(goal)}
                goal={goal}
                player={player}
                currentValue={currentValue}
                goalValue={goal.goalValue}
                statLabel={STAT_OPTIONS.find((option) => option.key === goal.statKey)?.label ?? goal.statKey}
                progressPct={progressPct}
                achieved={achieved}
                onPace={onPace}
                clock={clock}
                onRemove={() => removeGoal(goal)}
              />
            ))}
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
