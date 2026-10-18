import type { WatchActionRequest, WatchPhase } from '@smarteverything/domain';
import { clock } from '../../format/time';
import { count } from '../../format/number';
import type { HeartView } from './watch-heart';

type HeadlineTone = 'positive' | 'neutral' | 'warning';

export interface Headline {
  readonly tone: HeadlineTone;
  readonly label: string;
}

const LOW_BATTERY = 20;

export interface WatchFacts {
  readonly battery: number | null;
  readonly charging: boolean;
  readonly worn: boolean | null;
  readonly phase: WatchPhase | null;
  readonly syncing: boolean;
  readonly syncedAt: string | null;
  readonly onThisPhone: boolean;
}

export function lowBattery(facts: Pick<WatchFacts, 'battery' | 'charging'>): boolean {
  return facts.battery !== null && facts.battery <= LOW_BATTERY && !facts.charging;
}

export function headlineOf(facts: WatchFacts, lastSeen: number | null): Headline {
  if (lastSeen !== null) {
    return { tone: 'neutral', label: `Last seen ${clock(lastSeen)}` };
  }
  if (facts.charging) {
    return { tone: 'positive', label: 'Charging' };
  }
  if (lowBattery(facts)) {
    return { tone: 'warning', label: 'Low battery' };
  }
  if (facts.worn === true) {
    return { tone: 'positive', label: 'On wrist' };
  }
  return { tone: 'neutral', label: facts.worn === false ? 'Off wrist' : 'Not reporting' };
}

export interface StateLineInput {
  readonly facts: WatchFacts;
  readonly lastSeen: number | null;
  readonly owner: string | null;
  readonly ringing: boolean;
}

function syncedText(facts: WatchFacts): string | null {
  if (facts.syncing) {
    return 'Syncing…';
  }
  return facts.syncedAt === null ? null : `Synced ${clock(facts.syncedAt)}`;
}

export function stateLineOf({ facts, lastSeen, owner, ringing }: StateLineInput): string {
  if (ringing) {
    return 'Ringing… tap Stop ringing';
  }
  if (lastSeen !== null) {
    return owner === null ? 'via its phone' : `via ${owner}’s phone`;
  }
  const battery =
    facts.battery === null
      ? null
      : lowBattery(facts)
        ? 'Charge soon'
        : `Battery ${count(facts.battery)} %`;
  return [battery, syncedText(facts)].filter((part) => part !== null).join(' · ');
}

export interface SyncControl {
  readonly label: string;
  readonly loading: boolean;
  readonly disabled: boolean;
  readonly reason: string | null;
}

export function syncControlOf(facts: WatchFacts, owner: string | null): SyncControl {
  if (!facts.onThisPhone) {
    const who = owner === null ? 'its phone' : `${owner}’s phone`;
    return {
      label: `Sync from ${who}`,
      loading: false,
      disabled: true,
      reason: `Only ${who} can sync this watch`,
    };
  }
  if (facts.syncing) {
    return { label: 'Syncing…', loading: true, disabled: true, reason: null };
  }
  const connected = facts.phase === 'connected';
  return {
    label: 'Sync',
    loading: false,
    disabled: !connected,
    reason: connected ? null : 'The watch is not connected to this phone',
  };
}

export interface FindControl {
  readonly label: string;
  readonly filled: boolean;
  readonly loading: boolean;
  readonly disabled: boolean;
}

export function findControlOf(
  ringing: boolean,
  pending: boolean,
  lastSeen: number | null,
): FindControl {
  return {
    label: ringing ? 'Stop ringing' : 'Find watch',
    filled: ringing,
    loading: pending,
    disabled: lastSeen !== null && !ringing,
  };
}

export function heartCaption(view: HeartView | null): string | null {
  if (view === null) {
    return null;
  }
  return view.fresh ? 'Heart now' : `Heart ${clock(view.at)}`;
}

export interface Goal {
  readonly key: 'steps' | 'move' | 'active';
  readonly label: string;
  readonly value: number;
  readonly goal: number;
  readonly unit: string;
}

export function goalRingsOf(input: {
  readonly steps: number | null;
  readonly stepsGoal: number;
  readonly energy: number | null;
  readonly energyGoal: number;
  readonly minutes: number | null;
  readonly minutesGoal: number;
}): readonly Goal[] {
  const rings: readonly (Goal | null)[] = [
    { key: 'steps', label: 'Steps', value: input.steps ?? 0, goal: input.stepsGoal, unit: '' },
    input.energy === null
      ? null
      : { key: 'move', label: 'Move', value: input.energy, goal: input.energyGoal, unit: 'kcal' },
    input.minutes === null
      ? null
      : {
          key: 'active',
          label: 'Active',
          value: input.minutes,
          goal: input.minutesGoal,
          unit: 'min',
        },
  ];
  return rings.filter((ring): ring is Goal => ring !== null);
}

export type FindRequest = Extract<WatchActionRequest, { readonly type: 'find_watch' }>;

export function findRequestOf(ringing: boolean): FindRequest {
  return { type: 'find_watch', on: !ringing };
}
