import { DEFAULT_CAMERA_KEEP_DAYS, transcriptRetentionLabel } from '@smarteverything/domain';
import type { SelectOption } from '../../../components/select';
import { optionsOf } from '../transcripts/transcript-model';

const KEEP_DAYS: readonly number[] = [1, 3, 7, DEFAULT_CAMERA_KEEP_DAYS, 30, 60, 90, 180, 365];

export function keepDaysOptions(current: number): readonly SelectOption<string>[] {
  return optionsOf(KEEP_DAYS, current, transcriptRetentionLabel);
}
