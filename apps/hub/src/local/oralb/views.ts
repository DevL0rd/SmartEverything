import {
  ORALB_MODES,
  oralbModeOf,
  oralbRingDisplayOf,
  oralbRingOf,
  type OralbMode,
} from '@smarteverything/domain';
import type {
  DiagnosticsBrand,
  HandleView,
  HeadTimeline,
  HeadView,
  ViewContext,
} from '../toothbrush/brand';
import { entryProfileOf, identityOf, oralbSettingsOf, scheduleOf } from './config';
import type { OralbDecoder } from './decode';
import type { HeadTracker } from './head';
import { reminderOf } from './reminder';
import type { OralbState } from './state';
import { median } from './stats';

const DAY_MS = 86_400_000;

const DAY_S = 86_400;

const DEFAULT_ROUTINE_SECONDS = 120;

const MIN_RESET_JUMP = 1;

const NOT_READ: Omit<HeadView, 'baselineDays'> = {
  state: 'missing',
  type: null,
  usageS: null,
  limitS: null,
  wearPercent: null,
  sessionsLeft: null,
  replaceBy: null,
  madeOn: null,
  daysLeft: null,
  secondsLeft: null,
  reminder: null,
};

export function oralbHeadView(
  context: ViewContext,
  state: OralbState,
  tracker: HeadTracker,
): HeadView {
  const baselineDays = oralbSettingsOf(context.entry).headBaseline?.days ?? null;
  const reading = state.headReading;
  if (entryProfileOf(context.entry).head !== 'countdown' || reading === null) {
    return { ...NOT_READ, baselineDays };
  }
  const routineS = state.routineS ?? DEFAULT_ROUTINE_SECONDS;
  return {
    ...NOT_READ,
    state: 'fitted',
    wearPercent: tracker.wear(reading),
    sessionsLeft: reading.seconds > 0 ? Math.floor(reading.seconds / routineS) : null,
    replaceBy: new Date(context.deps.now().getTime() + reading.days * DAY_MS).toISOString(),
    daysLeft: reading.days,
    secondsLeft: reading.seconds,
    reminder: reminderOf(reading.state),
    baselineDays: tracker.baseline?.days ?? baselineDays,
  };
}

function modesOf(slots: readonly (number | null)[] | null): OralbMode[] {
  return (slots ?? []).flatMap((id) => {
    const mode = id === null ? null : oralbModeOf(id);
    return mode !== null && ORALB_MODES.includes(mode) ? [mode] : [];
  });
}

export function oralbHandleView(context: ViewContext, state: OralbState): HandleView {
  const identity = identityOf(context.entry);
  const drive = state.ringDrive;
  const schedule = state.pacer ?? scheduleOf(context.entry);
  return {
    motorHours: null,
    lifetimeSessions: null,
    faultHex: null,
    clockIsUnix: null,
    firmware: String(state.firmware ?? identity.firmware),
    oralb: {
      protocol: state.protocol ?? identity.protocol,
      modelId: state.modelId ?? identity.modelId,
      firmware: state.firmware ?? identity.firmware,
      ringColour: drive === null ? null : oralbRingOf(drive),
      ringDisplay: drive === null ? null : [...oralbRingDisplayOf(drive)],
      modeSlots: modesOf(state.modeSlots),
      pacer: schedule === null ? null : [...schedule],
      chargeCycles: null,
      brushingCycles: null,
      motorSeconds: null,
    },
  };
}

interface Point {
  readonly at: string;
  readonly value: number;
}

function segmentsOf(points: readonly Point[]): Point[][] {
  const segments: Point[][] = [];
  for (const point of points) {
    const current = segments.at(-1);
    const previous = current?.at(-1);
    if (
      current === undefined ||
      previous === undefined ||
      point.value > previous.value + MIN_RESET_JUMP
    ) {
      segments.push([point]);
    } else {
      current.push(point);
    }
  }
  return segments;
}

export function oralbHeadTimeline(context: ViewContext): HeadTimeline {
  const points = context.deps.series(context.device.id, 'brush_head_days_left').points;
  const segments = segmentsOf(points).filter((segment) => (segment[0]?.value ?? 0) > 0);
  return {
    timeline: segments.flatMap((segment, index) => {
      const first = segment[0];
      const last = segment.at(-1);
      return first === undefined || last === undefined
        ? []
        : [
            {
              serial: first.at,
              type: null,
              firstSeen: first.at,
              lastSeen: last.at,
              usageS: Math.max(0, first.value - last.value) * DAY_S,
              limitS: first.value * DAY_S,
              current: index === segments.length - 1,
            },
          ];
    }),
    perDayS: null,
  };
}

export function oralbDiagnostics(
  context: ViewContext,
  state: OralbState,
  decoder: OralbDecoder,
): DiagnosticsBrand {
  const block = oralbSettingsOf(context.entry);
  return {
    brand: 'oralb',
    identity: identityOf(context.entry),
    probes: block.probes,
    forceBands: block.forceBands,
    headBaseline: block.headBaseline,
    advertIntervalMs: median(state.advertIntervals),
    liveSource: state.liveSource,
    filterRegistered: true,
    records: decoder.records.map((record) => ({ ...record })),
  };
}
