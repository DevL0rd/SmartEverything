import {
  PLANNER_NOISE_COLOURS,
  type PlannerNoiseColour,
  type PlannerSleepSound,
  type PlannerSleepSoundNotice,
} from '@smarteverything/domain';
import type { SleepSoundRequest } from '../../../../modules/health-connect';
import { OFF, type MinuteOption } from './schedule-model';

export type SleepSoundKind = 'noise' | 'drive' | 'radio';

export const NOISE_LABELS: Readonly<Record<PlannerNoiseColour, string>> = {
  white: 'White noise',
  pink: 'Pink noise',
  brown: 'Brown noise',
};

export const NOISE_HINTS: Readonly<Record<PlannerNoiseColour, string>> = {
  white: 'Even hiss across every pitch',
  pink: 'Softer, like steady rain',
  brown: 'Deep rumble, like a waterfall',
};

export const NOISE_SLOPES: Readonly<Record<PlannerNoiseColour, number>> = {
  white: 0,
  pink: 0.5,
  brown: 1,
};

export const NOISES = PLANNER_NOISE_COLOURS;

export function sleepSoundKindOf(sound: PlannerSleepSound | null): SleepSoundKind {
  if (sound === null || sound.kind === 'noise') return 'noise';
  return sound.kind === 'radio' ? 'radio' : 'drive';
}

export function sleepSoundTitleOf(
  sound: PlannerSleepSound | null,
  itemName: string | null,
): string {
  if (sound === null) return 'No sound';
  switch (sound.kind) {
    case 'noise':
      return NOISE_LABELS[sound.colour];
    case 'radio':
      return sound.name;
    case 'file':
      return itemName ?? 'Drive file';
    case 'playlist':
      return `${itemName ?? 'Drive folder'}, ${sound.shuffle ? 'shuffled' : 'in order'}`;
  }
}

export function sleepSoundKindLabelOf(sound: PlannerSleepSound | null): string {
  if (sound === null) return 'Choose a sound';
  switch (sound.kind) {
    case 'noise':
      return 'Made on your phone';
    case 'radio':
      return 'Radio station';
    case 'file':
      return 'Music from Drive';
    case 'playlist':
      return 'Playlist from Drive';
  }
}

export function driveItemIdOf(sound: PlannerSleepSound | null): string | null {
  return sound !== null && (sound.kind === 'file' || sound.kind === 'playlist')
    ? sound.item_id
    : null;
}

const TIMER_CHOICES = [15, 30, 45, 60, 90, 120] as const;

const FADE_CHOICES = [0, 10, 30, 60, 120] as const;

function unique(values: readonly number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

export function timerLabelOf(minutes: number | null): string {
  if (minutes === null) return 'Until I stop it';
  return minutes % 60 === 0 ? `${String(minutes / 60)} h` : `${String(minutes)} min`;
}

export function timerOptionsOf(current: number | null): readonly MinuteOption[] {
  return [
    { value: OFF, label: timerLabelOf(null) },
    ...unique([...TIMER_CHOICES, ...(current === null ? [] : [current])]).map((value) => ({
      value: String(value),
      label: timerLabelOf(value),
    })),
  ];
}

export function fadeLabelOf(seconds: number): string {
  if (seconds === 0) return 'No fade';
  return seconds % 60 === 0 ? `${String(seconds / 60)} min fade` : `${String(seconds)} s fade`;
}

export function fadeOptionsOf(current: number): readonly MinuteOption[] {
  return unique([...FADE_CHOICES, current]).map((value) => ({
    value: String(value),
    label: fadeLabelOf(value),
  }));
}

export function sleepRequestOf(notice: PlannerSleepSoundNotice): SleepSoundRequest | null {
  if (notice.action === 'stop' || notice.sound === null) return null;
  return {
    source: notice.sound,
    timerMinutes: notice.timerMinutes,
    fadeSeconds: notice.fadeSeconds,
  };
}

export interface SleepPlayer {
  readonly linked: () => boolean;
  readonly start: (request: SleepSoundRequest) => Promise<void>;
  readonly stop: () => Promise<void>;
}

export async function receiveSleepSound(
  notice: PlannerSleepSoundNotice,
  player: SleepPlayer,
): Promise<boolean> {
  if (!player.linked()) return false;
  const request = sleepRequestOf(notice);
  if (request === null) await player.stop();
  else await player.start(request);
  return true;
}
