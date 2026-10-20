import type { BottleStatusView, BottleToday } from '@smarteverything/domain';
import { millilitres } from '../../../format/number';
import { DAY_MS, moment, relative } from '../../../format/time';
import type { IconName } from '../../../components/icon';

export type ChipTone = 'positive' | 'warning' | 'critical' | 'info' | 'neutral';

export interface StateChip {
  readonly label: string;
  readonly tone: ChipTone;
  readonly icon: IconName;
}

export const STALE_AFTER_MS = DAY_MS;

const ASLEEP_CHIP: StateChip = { label: 'Asleep', tone: 'neutral', icon: 'moon' };
const AWAKE_CHIP: StateChip = { label: 'Awake', tone: 'positive', icon: 'sun' };
const DRINKING_CHIP: StateChip = { label: 'Drinking', tone: 'positive', icon: 'glassWater' };
const DRINKING_WITHIN_MS = 5 * 60_000;

function isDrinking(view: BottleStatusView, now: number): boolean {
  const { lastDrinkAt } = view.today;
  return lastDrinkAt !== null && now - Date.parse(lastDrinkAt) <= DRINKING_WITHIN_MS;
}

function awakeChip(view: BottleStatusView, now: number): StateChip {
  return isDrinking(view, now) ? DRINKING_CHIP : AWAKE_CHIP;
}

export function isStale(view: Pick<BottleStatusView, 'lastSeenAt'>, now: number): boolean {
  return view.lastSeenAt === null || now - Date.parse(view.lastSeenAt) > STALE_AFTER_MS;
}

function capChip(view: BottleStatusView): StateChip | null {
  const { cap } = view;
  if (cap.fault !== null) {
    return { label: 'Fault', tone: 'critical', icon: 'alert' };
  }
  if (cap.cleaning) {
    return { label: 'Cleaning', tone: 'info', icon: 'sparkles' };
  }
  if (cap.interlock) {
    return { label: 'Cap off', tone: 'warning', icon: 'warning' };
  }
  if (cap.charging === 'charging') {
    return { label: 'Charging', tone: 'positive', icon: 'plug' };
  }
  if (cap.charging === 'charged') {
    return { label: 'Charged', tone: 'positive', icon: 'circleCheck' };
  }
  if (cap.locked) {
    return { label: 'Locked', tone: 'neutral', icon: 'lock' };
  }
  return cap.lowBattery ? { label: 'Battery low', tone: 'warning', icon: 'battery' } : null;
}

function linkChip(view: BottleStatusView, now: number): StateChip | null {
  switch (view.link) {
    case 'syncing':
      return { label: 'Syncing', tone: 'info', icon: 'refresh' };
    case 'sync_failed':
      return { label: 'Sync failed', tone: 'warning', icon: 'alert' };
    case 'no_phone':
      return { label: 'No phone', tone: 'warning', icon: 'smartphone' };
    case 'synced':
      return awakeChip(view, now);
    case 'asleep':
      return view.cap.state === 'hydration_reminder' ? awakeChip(view, now) : null;
  }
}

export function stateChipOf(view: BottleStatusView, now: number): StateChip {
  if (view.firstSyncPending) {
    return { label: 'Setting up', tone: 'info', icon: 'refresh' };
  }
  if (isStale(view, now)) {
    return { label: 'Not seen', tone: 'neutral', icon: 'eyeOff' };
  }
  return capChip(view) ?? linkChip(view, now) ?? ASLEEP_CHIP;
}

export function ageLine(view: BottleStatusView, now: number): string {
  if (view.lastSeenAt === null) {
    return 'Not seen yet';
  }
  if (isStale(view, now)) {
    return `Not seen since ${moment(view.lastSeenAt, now)}`;
  }
  return view.lastSyncAt === null ? 'Not synced yet' : `Synced ${relative(view.lastSyncAt, now)}`;
}

export interface Pace {
  readonly expectedMl: number;
  readonly deltaMl: number;
  readonly text: string;
}

export function paceOf(today: BottleToday, minuteOfDay: number): Pace {
  const span = Math.max(1, today.paceToMinute - today.paceFromMinute);
  const share = Math.min(1, Math.max(0, (minuteOfDay - today.paceFromMinute) / span));
  const expectedMl = Math.round(today.goalMl * share);
  const deltaMl = Math.round(today.totalMl) - expectedMl;
  if (expectedMl === 0) {
    return { expectedMl, deltaMl, text: 'On pace' };
  }
  const size = millilitres(Math.abs(deltaMl));
  return { expectedMl, deltaMl, text: deltaMl >= 0 ? `${size} ahead` : `${size} behind pace` };
}

export function ringProgress(today: BottleToday): number {
  return today.goalMl > 0 ? today.totalMl / today.goalMl : 0;
}

export function todaySummary(today: BottleToday, pace: Pace): string {
  const goal = `Today ${millilitres(Math.round(today.totalMl))} of ${millilitres(Math.round(today.goalMl))}`;
  return pace.expectedMl === 0 ? `${goal}.` : `${goal}, ${pace.text}.`;
}

export function levelLine(view: BottleStatusView): string {
  const { level } = view;
  if (level.ml === null) {
    return 'Level unknown';
  }
  return `${millilitres(level.ml)} in the bottle`;
}

export function batteryLine(view: BottleStatusView): string {
  const { batteryPct, daysLeft } = view.cap;
  if (batteryPct === null) {
    return 'Battery unknown';
  }
  return daysLeft === null
    ? `Battery ${String(batteryPct)}%`
    : `Battery ${String(batteryPct)}% · about ${String(daysLeft)} days left`;
}

export function lastDrinkLine(view: BottleStatusView, now: number): string {
  const { lastDrinkAt } = view.today;
  return lastDrinkAt === null ? 'No drinks yet today' : `Last drink ${relative(lastDrinkAt, now)}`;
}

export function bindingNotice(
  view: BottleStatusView,
): { readonly title: string; readonly body: string } | null {
  if (!view.noticePending) {
    return null;
  }
  const who = view.boundBy ?? 'The owner';
  return {
    title: `${who} linked this bottle to you`,
    body: 'Its drinks go into your water log and Health Connect. Keep it, or unlink it to stop new drinks. Drinks already logged stay.',
  };
}

export function bottleOfPerson<
  Bottle extends { readonly details: Readonly<Record<string, unknown>> },
>(bottles: readonly Bottle[], profileId: string | null): Bottle | null {
  const owned = bottles.find(
    (bottle) => profileId !== null && bottle.details['personId'] === profileId,
  );
  return owned ?? bottles.find((bottle) => bottle.details['personId'] === null) ?? null;
}
