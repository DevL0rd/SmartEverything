import { MICROWAVE_REASONS, type DeviceLogEntry } from '@smarteverything/domain';
import type { BadgeTone } from '../../../components/badge';
import type { TimelineSegment } from '../../../components/charts';
import { clock } from '../../../format/time';
import {
  PHASE_WORDS,
  drawParts,
  minutesLeftParts,
  type MicrowaveRun,
  type RunPhase,
} from './run-model';

export const COOKED_STATE = 'cooking';

export const OFFLINE_LINE = 'Not reachable. Check its Wi‑Fi.';

const NO_COOKING = 'No cooking recorded yet';

const BADGE_TONES: Readonly<Record<RunPhase, BadgeTone>> = {
  offline: 'neutral',
  door_open: 'neutral',
  paused: 'warning',
  running: 'info',
  ready: 'positive',
  idle: 'positive',
};

export function cardChip(run: Pick<MicrowaveRun, 'phase'>): {
  readonly tone: BadgeTone;
  readonly label: string;
} {
  return { tone: BADGE_TONES[run.phase], label: PHASE_WORDS[run.phase] };
}

export interface FigureSpec {
  readonly key: 'left' | 'draw';
  readonly value: string;
  readonly unit: string;
  readonly caption?: string;
}

function leftSpec(
  run: Pick<MicrowaveRun, 'leftMinutes' | 'readyAt'>,
  captions: boolean,
): FigureSpec | null {
  const left = minutesLeftParts(run.leftMinutes);
  if (left === null) {
    return null;
  }
  return {
    key: 'left',
    ...left,
    ...(captions && run.readyAt !== null ? { caption: `ready ${run.readyAt}` } : {}),
  };
}

function drawSpec(
  run: Pick<MicrowaveRun, 'phase' | 'watts'>,
  captions: boolean,
): FigureSpec | null {
  if (run.phase !== 'running' || run.watts === null || run.watts <= 0) {
    return null;
  }
  return { key: 'draw', ...drawParts(run.watts), ...(captions ? { caption: 'power' } : {}) };
}

export function figureSpecs(
  run: Pick<MicrowaveRun, 'phase' | 'leftMinutes' | 'readyAt' | 'watts'>,
  captions: boolean,
): readonly FigureSpec[] {
  if (run.phase !== 'running' && run.phase !== 'paused') {
    return [];
  }
  return [leftSpec(run, captions), drawSpec(run, captions)].filter(
    (spec): spec is FigureSpec => spec !== null,
  );
}

export function blockedReason(run: Pick<MicrowaveRun, 'phase' | 'blocked'>): string | null {
  switch (run.phase) {
    case 'door_open':
      return MICROWAVE_REASONS.doorOpen;
    case 'ready':
    case 'idle':
      return run.blocked;
    case 'offline':
    case 'paused':
    case 'running':
      return null;
  }
}

export function cookedCaptions(count: number): readonly string[] {
  return ['24 h ago', count === 1 ? 'Cooked once' : `Cooked ${String(count)} times`, 'Now'];
}

export function leftWords(run: Pick<MicrowaveRun, 'phase' | 'leftMinutes'>): string {
  if ((run.phase !== 'running' && run.phase !== 'paused') || run.leftMinutes === null) {
    return '';
  }
  return run.leftMinutes < 1
    ? ' Less than a minute left.'
    : ` ${String(run.leftMinutes)} minutes left.`;
}

export function factsLine(
  run: Pick<MicrowaveRun, 'phase' | 'lamp' | 'locked' | 'watts'>,
): string | null {
  if (run.phase === 'offline') {
    return null;
  }
  const draw =
    run.phase === 'running' && run.watts !== null && run.watts > 0 ? drawParts(run.watts) : null;
  return [
    run.phase === 'door_open' ? 'Door open' : 'Door closed',
    run.lamp ? 'Lamp on' : null,
    run.locked ? 'Kids lock on' : null,
    draw === null ? null : `${draw.value} ${draw.unit}`,
  ]
    .filter((part): part is string => part !== null)
    .join(' · ');
}

export function agoText(minutes: number): string {
  return minutes === 0 ? 'just now' : `${String(minutes)} min ago`;
}

function lastText(last: DeviceLogEntry | undefined): string {
  return last === undefined
    ? 'Door closed'
    : `Last: ${last.value ?? last.title}, ${clock(last.at)}`;
}

function readyLine(ago: number | null): string {
  return ago === null ? 'Food is ready' : `Food is ready · ${agoText(ago)}`;
}

function offlineLine(last: DeviceLogEntry | undefined): string {
  return last === undefined ? NO_COOKING : lastText(last);
}

export function stateLine(
  run: Pick<MicrowaveRun, 'phase' | 'settings' | 'ago' | 'lamp'>,
  last: DeviceLogEntry | undefined,
): string {
  switch (run.phase) {
    case 'offline':
      return offlineLine(last);
    case 'door_open':
      return run.lamp ? 'Door open · light on' : 'Door open';
    case 'running':
    case 'paused':
      return run.settings ?? PHASE_WORDS[run.phase];
    case 'ready':
      return readyLine(run.ago);
    case 'idle':
      return lastText(last);
  }
}

export function cookedSegments(
  cycles: readonly DeviceLogEntry[],
  from: number,
  to: number,
): readonly TimelineSegment<typeof COOKED_STATE>[] {
  return cycles.flatMap((cycle) => {
    const end = Date.parse(cycle.at);
    const start = Date.parse(cycle.started_at ?? cycle.at);
    return end <= from || start >= to
      ? []
      : [{ start: Math.max(start, from), end: Math.min(end, to), state: COOKED_STATE }];
  });
}
