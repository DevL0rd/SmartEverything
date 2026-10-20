import {
  SONICARE_HEAD_LIFETIME_SECONDS,
  headForecast,
  sessionsLeftOf,
  wearPercentOf,
  type HeadForecast,
} from '@smarteverything/domain';
import type {
  DiagnosticsBrand,
  HandleView,
  HeadTimeline,
  HeadView,
  ViewContext,
} from '../toothbrush/brand';
import { effectiveIdentity, entryConfigOf, entrySettingsOf } from './config';
import type { BrushState } from './state';

const DEFAULT_ROUTINE_SECONDS = 120;

const GRACE_SECONDS = 30;

type Fitted = Pick<HeadView, 'usageS' | 'limitS' | 'wearPercent' | 'sessionsLeft' | 'replaceBy'>;

const NO_FIGURES: Fitted = {
  usageS: null,
  limitS: null,
  wearPercent: null,
  sessionsLeft: null,
  replaceBy: null,
};

function forecastOf(context: ViewContext, state: BrushState): HeadForecast | null {
  const { head } = state;
  if (typeof head.serial !== 'string') {
    return null;
  }
  const row = context.deps.store.brushingSessions
    .heads(context.device.id)
    .find((item) => item.serial === head.serial);
  return row === undefined
    ? null
    : headForecast(
        [
          { at: row.firstSeen, usageS: row.firstUsageS },
          { at: row.lastSeen, usageS: row.usageS },
        ],
        state.routineS ?? DEFAULT_ROUTINE_SECONDS,
        row.limitS,
      );
}

function fittedFigures(context: ViewContext, state: BrushState): Fitted {
  const { head, routineS } = state;
  if (head.usageS === null) {
    return NO_FIGURES;
  }
  const limit = head.limitS ?? SONICARE_HEAD_LIFETIME_SECONDS;
  return {
    usageS: head.usageS,
    limitS: limit,
    wearPercent: wearPercentOf(head.usageS, limit),
    sessionsLeft: sessionsLeftOf(head.usageS, routineS ?? DEFAULT_ROUTINE_SECONDS, limit),
    replaceBy: forecastOf(context, state)?.replaceBy ?? null,
  };
}

export function sonicareHeadView(context: ViewContext, state: BrushState): HeadView {
  const known = state.headState(context.brushedSeconds, GRACE_SECONDS);
  return {
    state: known ?? 'missing',
    type: state.head.type,
    madeOn: state.head.made,
    daysLeft: null,
    secondsLeft: null,
    reminder: null,
    baselineDays: null,
    ...(known === 'fitted' ? fittedFigures(context, state) : NO_FIGURES),
  };
}

export function sonicareHandleView(context: ViewContext, state: BrushState): HandleView {
  const { motorSeconds, storedCount, handleClock, extras } = state;
  const { identity } = entryConfigOf(context.entry);
  return {
    motorHours: motorSeconds === null ? null : Math.round(motorSeconds / 360) / 10,
    lifetimeSessions: storedCount,
    faultHex: context.faulty
      ? `${(extras.errorPersistent ?? 0).toString(16)}:${(extras.errorVolatile ?? 0).toString(16)}`
      : null,
    clockIsUnix: handleClock === null ? identity.clockIsUnix : handleClock >= 1_577_836_800,
    firmware: extras.firmware ?? identity.firmware,
    oralb: null,
  };
}

export function sonicareHeadTimeline(context: ViewContext, state: BrushState): HeadTimeline {
  const current = state.head.serial;
  const forecast = forecastOf(context, state);
  return {
    timeline: context.deps.store.brushingSessions.heads(context.device.id).map((head) => ({
      serial: head.serial,
      type: head.type,
      firstSeen: head.firstSeen,
      lastSeen: head.lastSeen,
      usageS: head.usageS,
      limitS: head.limitS,
      current: head.serial === current,
    })),
    perDayS: forecast?.perDayS ?? null,
  };
}

export function sonicareDiagnostics(context: ViewContext, state: BrushState): DiagnosticsBrand {
  const { extras, head, handleClock } = state;
  return {
    brand: 'sonicare',
    identity: effectiveIdentity(
      entryConfigOf(context.entry).identity,
      entrySettingsOf(context.entry),
    ),
    headSerial: typeof head.serial === 'string' ? head.serial : null,
    headRing: head.ring,
    nfcVersion: extras.nfcVersion,
    nfcUrl: extras.nfcUrl,
    errorPersistent: extras.errorPersistent,
    errorVolatile: extras.errorVolatile,
    calibration: [...extras.calibration],
    easyStart: extras.easyStart,
    sensorMask: extras.sensorMask,
    settingsBits: extras.settingsBits,
    handleClock,
  };
}
