import type { PlannerImportResult } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { SegmentBar, type BarSegment } from '../../../components/charts/segment-bar';
import { Icon } from '../../../components/icon';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import type { ColourRole } from '../../../design/tokens';
import { importReportOf } from './feeds-model';

const COUNT_COLOUR: Readonly<Record<'added' | 'updated' | 'unchanged', ColourRole>> = {
  added: 'positive',
  updated: 'viz-1',
  unchanged: 'on-surface-faint',
};

export interface ImportReportProps {
  readonly report: { readonly calendar: string; readonly result: PlannerImportResult } | null;
  readonly onClose: () => void;
}

function Skipped({ lines }: { readonly lines: readonly string[] }): ReactNode {
  if (lines.length === 0) {
    return (
      <View className="flex-row items-center gap-2">
        <Icon name="circleCheck" size={16} tone="positive" />
        <Text variant="caption" tone="variant">
          Everything in the file was understood.
        </Text>
      </View>
    );
  }
  return (
    <View className="gap-1.5 rounded-md bg-surface-2 px-3 py-2.5">
      <Text variant="caption" tone="variant">
        Not imported
      </Text>
      {lines.map((line) => (
        <View key={line} className="flex-row items-start gap-2">
          <Icon name="info" size={16} tone="variant" />
          <Text variant="caption" className="min-w-0 flex-1">
            {line}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function ImportReportSheet({ report, onClose }: ImportReportProps): ReactNode {
  const summary = report === null ? null : importReportOf(report.result);
  const segments: readonly BarSegment[] =
    summary?.counts.map((count) => ({
      label: `${count.label} ${String(count.count)}`,
      value: count.count,
      colour: COUNT_COLOUR[count.key],
    })) ?? [];
  return (
    <Sheet
      open={report !== null}
      onClose={onClose}
      title={report === null ? 'Import' : `Imported into ${report.calendar}`}
      detents={['fit']}
      subpage
    >
      {summary === null ? null : (
        <View className="gap-3 px-4 pb-3">
          <Text variant="title-3">{summary.headline}</Text>
          <SegmentBar segments={segments} label="Imported items" legend size="thick" />
          <Skipped lines={summary.skipped} />
        </View>
      )}
    </Sheet>
  );
}
