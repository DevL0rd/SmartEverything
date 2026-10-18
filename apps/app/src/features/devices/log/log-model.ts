import type {
  DeviceLogCause,
  DeviceLogCauseKind,
  DeviceLogEffect,
  DeviceLogEntry,
} from '@smarteverything/domain';
import type { IconName } from '../../../components/icon';
import type { Tone } from '../../../components/tone';
import { MINUTE_MS, clock, dayLabel } from '../../../format/time';

export const LOG_PAGE_SIZE = 20;

interface CauseLook {
  readonly icon: IconName;
  readonly label: string;
}

export const CAUSE_LOOKS: Readonly<Record<DeviceLogCauseKind, CauseLook>> = {
  button: { icon: 'hand', label: 'Button' },
  app: { icon: 'smartphone', label: 'App' },
  automation: { icon: 'automations', label: 'Automation' },
  assistant: { icon: 'sparkles', label: 'AI' },
  schedule: { icon: 'clock', label: 'Schedule' },
  device: { icon: 'cpu', label: 'On the device' },
  unknown: { icon: 'info', label: 'Outside SmartEverything' },
};

export function causeText(cause: DeviceLogCause): string {
  const label = CAUSE_LOOKS[cause.kind].label;
  return cause.name === undefined ? label : `${label} · ${cause.name}`;
}

export function effectText(effect: DeviceLogEffect): string {
  switch (effect.outcome) {
    case 'ok':
      return effect.title;
    case 'failed':
      return `${effect.title} · failed`;
    case 'skipped':
      return `${effect.title} · skipped`;
    case 'running':
      return `${effect.title} · running`;
  }
}

export function effectIcon(effect: DeviceLogEffect): IconName {
  switch (effect.outcome) {
    case 'ok':
      return 'circleCheck';
    case 'failed':
      return 'alert';
    case 'skipped':
      return 'ban';
    case 'running':
      return 'loader';
  }
}

export function effectTone(effect: DeviceLogEffect): Tone {
  return effect.outcome === 'failed' ? 'critical' : 'variant';
}

export function tickerText(entry: DeviceLogEntry): string {
  const first = entry.effects?.[0];
  if (first !== undefined) {
    return `${entry.title} · ${effectText(first)}`;
  }
  return entry.kind === 'change' || entry.kind === 'run'
    ? `${entry.title} · ${causeText(entry.cause)}`
    : entry.title;
}

export function tickerTone(entry: DeviceLogEntry): Tone {
  return entry.effects?.some((effect) => effect.outcome === 'failed') === true
    ? 'critical'
    : 'variant';
}

export function cardTime(at: string): string {
  return clock(at);
}

export function pageTime(at: string, now: number): string {
  const elapsed = Math.max(0, now - Date.parse(at));
  if (elapsed < MINUTE_MS) {
    return 'Now';
  }
  if (elapsed < 60 * MINUTE_MS) {
    return `${String(Math.floor(elapsed / MINUTE_MS))} min`;
  }
  const day = dayLabel(at, now);
  return day === 'Today' ? clock(at) : `${day} ${clock(at)}`;
}

export function nextLogCursor(page: readonly DeviceLogEntry[]): string | undefined {
  return page.length < LOG_PAGE_SIZE ? undefined : page.at(-1)?.at;
}
