import { type FC } from 'react';
import clsx from 'clsx';
import type { Athlete, GameClock, Goal } from '../types';

type GoalCardProps = {
  goal: Goal;
  player?: Athlete;
  currentValue: number;
  goalValue: number;
  statLabel: string;
  progressPct: number;
  onRemove: () => void;
  achieved: boolean;
  onPace: boolean | null;
  clock: GameClock | null;
};

const formatNumber = (value: number) =>
  value >= 1000 ? `${value.toFixed(0)}` : value.toLocaleString();

export const GoalCard: FC<GoalCardProps> = ({
  goal,
  player,
  currentValue,
  goalValue,
  statLabel,
  progressPct,
  onRemove,
  achieved,
  onPace,
  clock
}) => {
  const statusLabel = achieved ? 'Hit!' : onPace == null ? null : onPace ? 'On pace' : 'Behind pace';
  const statusColor = achieved ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/40' : onPace ? 'bg-emerald-500/10 text-emerald-200 border-emerald-400/40' : 'bg-amber-500/10 text-amber-200 border-amber-400/40';

  return (
    <div className="rounded-2xl border border-slate-700/60 bg-slate-900/70 p-6 shadow-xl backdrop-blur">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-white">{goal.displayName}</h3>
          <p className="text-sm text-slate-300">
            {player?.team ?? '--'} · {player?.position ?? '--'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (confirm('Remove this goal?')) {
              onRemove();
            }
          }}
          className="rounded-full border border-slate-700 px-3 py-1 text-xs font-medium text-slate-300 hover:border-red-500/60 hover:text-red-300"
        >
          Remove
        </button>
      </div>

      <div className="mt-6 space-y-4">
        <div>
          <p className="text-sm uppercase tracking-wide text-slate-400">{statLabel}</p>
          <div className="mt-1 flex items-end gap-2 text-3xl font-bold text-white">
            <span>{formatNumber(currentValue)}</span>
            <span className="text-base font-medium text-slate-400">/ {formatNumber(goalValue)}</span>
          </div>
        </div>

        <div className="h-3 overflow-hidden rounded-full bg-slate-800">
          <div
            className={clsx('h-full rounded-full transition-all duration-500', achieved ? 'bg-emerald-500' : 'bg-sky-500')}
            style={{ width: `${Math.min(100, progressPct).toFixed(1)}%` }}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          {statusLabel && (
            <span className={clsx('rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide', statusColor)}>
              {statusLabel}
            </span>
          )}
          {clock?.displayClock && clock.totalSecondsRemaining != null && clock.totalSecondsRemaining > 0 && (
            <span className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-300">
              Q{clock.period} · {clock.displayClock}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default GoalCard;
