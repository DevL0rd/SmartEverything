import type { RuntimeLogRow } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { CodeBlock } from '../../../components/code';
import { CollapseBody, CollapseRoot, TurnChevron } from '../../../components/disclosure';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import type { Tone } from '../../../components/tone';

const LEVEL_TONE: Readonly<Record<RuntimeLogRow['level'], Tone>> = {
  trace: 'variant',
  debug: 'variant',
  info: 'default',
  warn: 'primary',
  error: 'critical',
  exception: 'critical',
};

interface RuntimeLogRowProps {
  readonly record: RuntimeLogRow;
  readonly open: boolean;
  readonly onToggle: () => void;
}

export function RuntimeLogEntry({ record, open, onToggle }: RuntimeLogRowProps): ReactNode {
  const time = new Date(record.at).toLocaleString();
  const versions = [record.release, record.bundle].filter((one) => one !== null).join(' · ');
  const origin = `${record.scope} · ${record.runtime} · ${record.platform}${versions === '' ? '' : ` · ${versions}`}`;
  return (
    <CollapseRoot className="border-b border-outline-variant">
      <Interactive
        label={`Details for ${record.event}, ${record.level}, ${time}, ${origin}`}
        expanded={open}
        onPress={onToggle}
        className="min-h-touch-min flex-row items-center gap-2 px-3 py-2"
      >
        <View className="min-w-0 flex-1">
          <View className="flex-row items-baseline gap-2">
            <Text variant="caption" tone={LEVEL_TONE[record.level]} className="uppercase">
              {record.level}
            </Text>
            <Text variant="body-strong" className="min-w-0 shrink">
              {record.event}
            </Text>
          </View>
          <Text variant="footnote" tone="variant">
            {time} · {origin}
          </Text>
        </View>
        <TurnChevron open={open} />
      </Interactive>
      {open ? (
        <CollapseBody className="gap-1 px-3 pb-2">
          {record.failure === null ? null : (
            <Text variant="footnote" tone="critical" selectable>
              {record.failure.message}
            </Text>
          )}
          <CodeBlock label={record.source} code={JSON.stringify(record, null, 2)} />
        </CollapseBody>
      ) : null}
    </CollapseRoot>
  );
}
