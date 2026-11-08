import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import type { AssistantMessageRow } from '@smarteverything/domain';
import { CollapseBody, CollapseRoot, TurnChevron } from '../../../components/disclosure';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { joinParts } from '../../../format/text';
import { clock } from '../../../format/time';
import { useRow } from '../../../store/selectors';
import { callViewOf, failedActionsOf, moreLinesOf, type CallLine } from '../data/call-transcript';
import { useTimeZone } from './message-parts';

function useCallHeader(row: AssistantMessageRow, length: string): string {
  const timeZone = useTimeZone();
  const device = useRow('devices', row.origin?.device_id ?? null);
  return joinParts([device?.label, clock(row.created_at, timeZone), length]);
}

function Line({ line }: { readonly line: CallLine }): ReactNode {
  return (
    <Text variant="footnote" tone={line.tone} selectable>
      {line.speaker === null ? null : (
        <Text variant="footnote" tone="variant" className="font-sans-medium">
          {`${line.speaker}: `}
        </Text>
      )}
      {line.text}
    </Text>
  );
}

function Lines({ lines }: { readonly lines: readonly CallLine[] }): ReactNode {
  return lines.map((line, index) => <Line key={String(index)} line={line} />);
}

function Header({
  row,
  length,
  failures,
}: {
  readonly row: AssistantMessageRow;
  readonly length: string;
  readonly failures: number;
}): ReactNode {
  const text = useCallHeader(row, length);
  return (
    <View className="h-5 flex-row items-center gap-1.5">
      <Text variant="label" tone="positive" numberOfLines={1} className="shrink-0">
        Call
      </Text>
      <Text variant="caption" tone="faint" numberOfLines={1} className="tabular min-w-0 shrink">
        {text}
      </Text>
      {failures === 0 ? null : (
        <Text variant="caption" tone="critical" numberOfLines={1} className="shrink-0">
          {failedActionsOf(failures)}
        </Text>
      )}
    </View>
  );
}

function More({
  count,
  open,
  onToggle,
}: {
  readonly count: number;
  readonly open: boolean;
  readonly onToggle: () => void;
}): ReactNode {
  const label = open ? 'Show less' : moreLinesOf(count);
  return (
    <Interactive
      label={label}
      expanded={open}
      hitSlop={8}
      onPress={onToggle}
      className="mt-0.5 h-5 flex-row items-center gap-1 self-start"
      layerClassName="rounded-sm"
    >
      <Text variant="footnote" tone="variant" numberOfLines={1} className="font-sans-medium">
        {label}
      </Text>
      <TurnChevron open={open} />
    </Interactive>
  );
}

function Avatar({ row }: { readonly row: AssistantMessageRow }): ReactNode {
  const device = useRow('devices', row.origin?.device_id ?? null);
  return (
    <View aria-hidden className="size-6 items-center justify-center rounded-full bg-positive/16">
      <Icon name={device === null ? 'phone' : 'camera'} size={16} tone="positive" />
    </View>
  );
}

export function CallCard({ row }: { readonly row: AssistantMessageRow }): ReactNode {
  const [open, setOpen] = useState(false);
  const view = callViewOf(row);
  return (
    <View className="w-full flex-row gap-2">
      <Avatar row={row} />
      <CollapseRoot className="min-w-0 flex-1">
        <Header row={row} length={view.length} failures={view.failures} />
        <Lines lines={view.lead} />
        {open ? (
          <CollapseBody>
            <Lines lines={view.rest} />
          </CollapseBody>
        ) : null}
        {view.rest.length === 0 ? null : (
          <More
            count={view.rest.length}
            open={open}
            onToggle={() => {
              setOpen(!open);
            }}
          />
        )}
      </CollapseRoot>
    </View>
  );
}
