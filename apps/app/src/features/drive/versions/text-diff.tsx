import type { ReactNode } from 'react';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { DiffCode } from '../../../components/diff-code';
import { Switch } from '../../../components/switch';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { useIdiom } from '../../../design/platform';
import {
  changeSummary,
  gutterDigits,
  segmentsOf,
  signedCount,
  unchangedText,
  type CompareNames,
  type ComparedText,
  type DiffSegment,
  type LineDiff,
} from './diff-model';

const FRAME = 'overflow-hidden rounded-md border border-outline-variant bg-surface-1';

function Counts({
  diff,
  names,
}: {
  readonly diff: LineDiff;
  readonly names: CompareNames;
}): ReactNode {
  const changed = diff.added + diff.removed > 0;
  return (
    <Text variant="footnote" tone="variant" className="min-w-0 shrink" numberOfLines={1}>
      {changed ? (
        <>
          <Text variant="footnote" tone="positive" className="tabular-nums">
            {`${signedCount('+', diff.added)} `}
          </Text>
          <Text variant="footnote" tone="critical" className="tabular-nums">
            {`${signedCount('−', diff.removed)} `}
          </Text>
        </>
      ) : null}
      {changeSummary(diff, names)}
    </Text>
  );
}

function UnchangedSwitch({
  value,
  onChange,
}: {
  readonly value: boolean;
  readonly onChange: (value: boolean) => void;
}): ReactNode {
  return (
    <View className="flex-row items-center gap-2">
      <Switch value={value} onChange={onChange} label="Show unchanged lines" />
      <Text variant="footnote" tone="variant" aria-hidden>
        Show unchanged lines
      </Text>
    </View>
  );
}

function Segment({
  segment,
  language,
  gutter,
  first,
  last,
}: {
  readonly segment: DiffSegment;
  readonly language: string | null;
  readonly gutter: number;
  readonly first: boolean;
  readonly last: boolean;
}): ReactNode {
  if (segment.kind === 'lines') {
    return (
      <View className="px-3 py-2">
        <DiffCode lines={segment.lines} language={language} gutter={gutter} />
      </View>
    );
  }
  return (
    <View
      className={cn(
        'border-outline-variant bg-surface-2 px-3 py-1',
        !first && 'border-t',
        !last && 'border-b',
      )}
    >
      <Text variant="caption" tone="faint">
        {unchangedText(segment.count)}
      </Text>
    </View>
  );
}

function Lines({
  compared,
  all,
}: {
  readonly compared: ComparedText;
  readonly all: boolean;
}): ReactNode {
  const { diff, language } = compared;
  const gutter = gutterDigits(diff.lines);
  const segments = segmentsOf(diff.lines, all);
  return segments.map((segment, index) => (
    <Segment
      key={segment.key}
      segment={segment}
      language={language}
      gutter={gutter}
      first={index === 0}
      last={index === segments.length - 1}
    />
  ));
}

export function TextDiff({
  compared,
  names,
}: {
  readonly compared: ComparedText;
  readonly names: CompareNames;
}): ReactNode {
  const pointer = useIdiom() === 'pointer';
  const [all, setAll] = useState(false);
  return (
    <View className={pointer ? 'min-h-0 flex-1 gap-3' : 'gap-3'}>
      <View className="flex-row flex-wrap items-center justify-between gap-2">
        <Counts diff={compared.diff} names={names} />
        <UnchangedSwitch value={all} onChange={setAll} />
      </View>
      {pointer ? (
        <ScrollView className={cn('min-h-0 flex-1', FRAME)}>
          <Lines compared={compared} all={all} />
        </ScrollView>
      ) : (
        <View className={FRAME}>
          <Lines compared={compared} all={all} />
        </View>
      )}
    </View>
  );
}
