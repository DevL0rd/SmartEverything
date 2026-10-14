import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { Icon } from '../../../components/icon';
import type { Tone } from '../../../components/tone';
import type { ConsoleLevel, ConsoleRecord } from './browser-diagnostics-contract';
const LEVEL_TONE: Readonly<Record<ConsoleLevel, Tone>> = {
  error: 'critical',
  warning: 'warning',
  info: 'variant',
  debug: 'faint',
};
export function BrowserConsoleRow({
  record,
  onInspect,
}: {
  readonly record: ConsoleRecord;
  readonly onInspect: () => void;
}): ReactNode {
  const [expanded, setExpanded] = useState(false);
  return (
    <View className="border-b border-outline-variant">
      <Interactive
        label={`${record.level}: ${record.message}`}
        expanded={expanded}
        onPress={() => {
          onInspect();
          setExpanded(!expanded);
        }}
        className="min-h-touch-min flex-row items-start gap-2 px-3 py-2"
      >
        <Text variant="caption" tone="faint" className="font-mono shrink-0">
          {record.time}
        </Text>
        <Icon
          name={record.level === 'error' ? 'alert' : 'dot'}
          size={16}
          tone={LEVEL_TONE[record.level]}
        />
        <View className="min-w-0 flex-1 gap-1">
          <Text variant="caption" className="font-mono break-all">
            {record.message}
          </Text>
          {record.source === null ? null : (
            <Text variant="caption" tone="faint" className="font-mono break-all">
              {record.source}
            </Text>
          )}
        </View>
        <Icon name={expanded ? 'chevronUp' : 'chevronDown'} size={16} tone="faint" />
      </Interactive>
      {expanded ? <RecordDetails record={record} /> : null}
    </View>
  );
}
function RecordDetails({ record }: { readonly record: ConsoleRecord }): ReactNode {
  return (
    <View className="gap-1 bg-surface-2 px-3 pb-3 pt-2">
      <Text variant="caption" tone={LEVEL_TONE[record.level]}>
        {record.level}
      </Text>
      <Text variant="caption" selectable className="font-mono break-all">
        {record.stack ?? 'No stack details were supplied.'}
      </Text>
      {record.truncatedBytes === 0 ? null : (
        <Text variant="caption" tone="warning">
          {record.truncatedBytes} bytes omitted from this entry
        </Text>
      )}
    </View>
  );
}
