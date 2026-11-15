import type { DriveScrubState } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { SegmentBar, type BarSegment } from '../../../components/charts/segment-bar';
import { Text } from '../../../components/text';
import { usePausable } from '../../../design/external-store';
import { count } from '../../../format/number';
import { driveProgress, type DriveProgress } from '../data';

export type ScrubPass = Exclude<DriveScrubState, { readonly state: 'idle' }>;

export interface ScrubCounts {
  readonly checked: number;
  readonly total: number;
  readonly corrupt: number;
}

export const SCRUB_EXPLAINER =
  'Reads every file back from the disk and checks it against its stored fingerprint, so damage on the disk is found';

export function damagedText(corrupt: number): string {
  if (corrupt === 0) return 'nothing damaged or unreadable';
  return `${corrupt === 1 ? '1 file' : `${count(corrupt)} files`} damaged or unreadable`;
}

export function liveScrubCountsOf(
  progress: DriveProgress,
): Pick<ScrubCounts, 'checked' | 'total'> | null {
  const steps = Object.values(progress).flatMap((root) =>
    root.scrub === undefined ? [] : [root.scrub],
  );
  const total = steps.reduce((sum, step) => sum + step.total, 0);
  if (total === 0) return null;
  return { checked: steps.reduce((sum, step) => sum + step.done, 0), total };
}

export function scrubCountsOf(scrub: ScrubPass, progress: DriveProgress): ScrubCounts {
  const live = scrub.state === 'running' ? liveScrubCountsOf(progress) : null;
  const reached = live ?? { checked: scrub.checked, total: scrub.total };
  return { ...reached, corrupt: Math.min(scrub.corrupt, reached.checked) };
}

export function scrubShareOf(counts: ScrubCounts): number {
  return counts.total === 0 ? 0 : counts.checked / counts.total;
}

export function scrubSegmentsOf(counts: ScrubCounts, running: boolean): readonly BarSegment[] {
  return [
    {
      label: 'Read back fine',
      value: counts.checked - counts.corrupt,
      colour: running ? 'info' : 'warning',
    },
    { label: 'Damaged or unreadable', value: counts.corrupt, colour: 'critical' },
  ];
}

export function scrubCountLineOf(counts: ScrubCounts): string {
  return `${count(counts.checked)} of ${count(counts.total)} files read back · ${damagedText(counts.corrupt)}`;
}

export function useScrubCounts(scrub: ScrubPass): ScrubCounts {
  return scrubCountsOf(scrub, usePausable(driveProgress.subscribe, driveProgress.get));
}

export function ScrubProgress({ scrub }: { readonly scrub: ScrubPass }): ReactNode {
  const counts = useScrubCounts(scrub);
  const line = scrubCountLineOf(counts);
  return (
    <View className="w-full gap-1.5">
      <SegmentBar
        size="thick"
        label={scrub.state === 'running' ? 'Scrub progress' : 'Stopped scrub'}
        segments={scrubSegmentsOf(counts, scrub.state === 'running')}
        total={counts.total}
      />
      <Text
        variant="footnote"
        tone={counts.corrupt === 0 ? 'variant' : 'critical'}
        className="tabular"
      >
        {line}
      </Text>
    </View>
  );
}
