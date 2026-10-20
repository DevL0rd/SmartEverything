import type { BrushingSession } from '@smarteverything/domain';
import {
  ARCH_CAPTION,
  QUARTER_COUNT,
  centreLines,
  quartersOf,
  targetsOf,
  type Quarter,
} from './arch-model';
import { clockText } from '../../toothbrush/model/brush-model';
import { faceOf, faceText, type Face } from './face-model';

export interface RecapView {
  readonly quarters: readonly Quarter[] | null;
  readonly big: string;
  readonly small: string;
  readonly caption: string;
  readonly face: Face | null;
  readonly faceLine: string | null;
}

export const NOT_RECORDED = 'Quarters not recorded for this session';

export function recapViewOf(session: BrushingSession): RecapView {
  const face = faceOf(session.details?.face ?? null);
  const faceLine = faceText(face);
  const paced = session.details?.sectors !== 0 && session.zones.length === QUARTER_COUNT;
  if (!paced) {
    return { quarters: null, big: '', small: '', caption: NOT_RECORDED, face, faceLine };
  }
  const quarters = quartersOf({
    zoneSeconds: session.zones,
    targets: targetsOf(null, session.routineS),
    current: null,
    finished: true,
    pacerOn: true,
  });
  const lines = centreLines({
    elapsedS: session.durationS,
    routineS: session.routineS,
    current: null,
    finished: true,
    quarters,
  });
  return { quarters, ...lines, caption: ARCH_CAPTION, face, faceLine };
}

export function routineWord(
  session: Pick<BrushingSession, 'complete' | 'durationS' | 'routineS'>,
): string {
  return session.complete
    ? 'Routine complete'
    : `Stopped at ${clockText(session.durationS)} of ${clockText(session.routineS)}`;
}
