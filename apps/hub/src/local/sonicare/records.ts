import { modeOfId, recordStart, resolveMode, type StoredRecord } from '@smarteverything/ble';
import {
  BRUSH_INTENSITIES,
  isComplete,
  type BrushIntensity,
  type BrushMode,
  type SonicareProfile,
} from '@smarteverything/domain';
import type { RetainedDraft } from '../toothbrush/brand';

export interface ModeContext {
  readonly profile: SonicareProfile;
  readonly model: string | null;
  readonly routineIds: readonly number[] | null;
}

export interface RecordContext extends ModeContext {
  readonly handleClock: number | null;
  readonly handleClockAtMs: number | null;
  readonly headSerial: string | null | undefined;
}

export function modeOfRecord(context: ModeContext, record: StoredRecord): BrushMode | null {
  if (context.profile.writes && record.routineId !== null) {
    return modeOfId(record.routineId);
  }
  return resolveMode({
    selectsById: false,
    routineId: null,
    position: record.modePosition,
    routineIds: context.routineIds,
    model: context.model,
  });
}

function intensityOf(code: number): BrushIntensity | null {
  return BRUSH_INTENSITIES[code] ?? null;
}

export function retainedDraft(
  context: RecordContext,
  record: StoredRecord,
  now: Date,
): RetainedDraft | null {
  if (context.handleClock === null) {
    return null;
  }
  const clockAt = context.handleClockAtMs === null ? now : new Date(context.handleClockAtMs);
  return {
    handleSessionId: record.sessionId,
    startedAt: recordStart(record, context.handleClock, clockAt).toISOString(),
    durationS: record.durationS,
    routineS: record.routineS,
    mode: modeOfRecord(context, record),
    intensity: intensityOf(record.intensity),
    complete: isComplete(record.durationS, record.routineS),
    zones: null,
    details: null,
    pressure: null,
    headSerial: typeof context.headSerial === 'string' ? context.headSerial : null,
  };
}
