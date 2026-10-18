import { USAGE_WORK_LABELS, type CostState, type UsageLedgerRow } from '@smarteverything/domain';
import { count } from '../../../format/number';
import { duration } from '../../../format/time';
import { joinParts } from '../../../format/text';

const COST_STATE_LABELS: Readonly<Record<CostState, string>> = {
  estimated: 'Estimated, settling',
  reported: 'Reported by the provider',
  reconciled: 'Final',
};

export function costStateLabel(state: CostState): string {
  return COST_STATE_LABELS[state];
}

function seconds(ms: number): number {
  return Math.round(ms / 1000);
}

function meterLine(row: UsageLedgerRow): string {
  const audio = row.audio_in_ms + row.audio_out_ms;
  if (audio > 0) {
    return `Call ${duration(seconds(Math.max(row.audio_in_ms, row.audio_out_ms)))}`;
  }
  return joinParts([
    row.tokens_in + row.tokens_out > 0
      ? `${count(row.tokens_in)} in · ${count(row.tokens_out)} out tokens`
      : null,
    row.images > 0 ? `${String(row.images)} ${row.images === 1 ? 'image' : 'images'}` : null,
    row.video_ms > 0 ? `${duration(seconds(row.video_ms))} video` : null,
  ]);
}

export function titleOfRow(row: UsageLedgerRow): string {
  return row.chat?.label ?? USAGE_WORK_LABELS[row.work];
}

export function detailOfRow(row: UsageLedgerRow, showPerson: boolean): string {
  return joinParts([showPerson ? row.profile.label : null, row.model?.label, meterLine(row)]);
}
