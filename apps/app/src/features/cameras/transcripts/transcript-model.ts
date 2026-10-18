import {
  TRANSCRIPT_PAUSE_LABELS,
  transcriptRetentionLabel,
  type TranscriptListening,
  type TranscriptSettings,
} from '@smarteverything/domain';
import type { SelectOption } from '../../../components/select';
import type { Money } from '../../region';

const RETENTION_DAYS: readonly number[] = [1, 3, 7, 14, 30, 90, 180, 365];

const DAILY_CAPS_USD: readonly number[] = [0.1, 0.25, 0.5, 1, 2, 5, 10, 25];

function optionsOf(
  values: readonly number[],
  current: number,
  label: (value: number) => string,
): readonly SelectOption<string>[] {
  const all = values.includes(current)
    ? values
    : [...values, current].sort((first, second) => first - second);
  return all.map((value) => ({ value: String(value), label: label(value) }));
}

export function retentionOptions(settings: TranscriptSettings): readonly SelectOption<string>[] {
  return optionsOf(RETENTION_DAYS, settings.retention_days, transcriptRetentionLabel);
}

export function capOptions(
  settings: TranscriptSettings,
  money: Money,
): readonly SelectOption<string>[] {
  return optionsOf(DAILY_CAPS_USD, settings.daily_cap_usd, money.dollars);
}

export function listeningDetail(listening: TranscriptListening): string | null {
  return listening.state === 'paused' ? TRANSCRIPT_PAUSE_LABELS[listening.reason] : null;
}
