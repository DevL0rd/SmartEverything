import type { ReactNode } from 'react';
import { memo } from 'react';
import { View } from 'react-native';
import type { ProcessRow } from '@smarteverything/domain';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import {
  cpuText,
  diskText,
  gpuText,
  helpersText,
  memoryText,
  phoneLine,
  spokenRow,
  userText,
  type ProcessLayout,
} from './process-format';

const INDENT = 16;
const SHARE_PER_CPU_POINT = 0.03;

export interface ProcessRowProps {
  readonly rowKey: string;
  readonly row: ProcessRow;
  readonly depth: number;
  readonly open: boolean | null;
  readonly tree: boolean;
  readonly layout: ProcessLayout;
  readonly gpuShown: boolean;
  readonly onOpen: (key: string) => void;
  readonly onToggle: (key: string) => void;
}

const FRAME: Readonly<Record<ProcessLayout, string>> = {
  phone: 'h-16 flex-row items-center border-t border-outline-variant pl-4',
  table: 'h-12 flex-row items-center border-t border-outline-variant pl-4',
  full: 'h-12 flex-row items-center border-t border-outline-variant pl-4',
};

function Toggle({
  name,
  open,
  rowKey,
  onToggle,
}: {
  readonly name: string;
  readonly open: boolean | null;
  readonly rowKey: string;
  readonly onToggle: (key: string) => void;
}): ReactNode {
  if (open === null) return <View className="size-8" />;
  return (
    <Interactive
      label={`${open ? 'Collapse' : 'Expand'} ${name}`}
      expanded={open}
      onPress={() => {
        onToggle(rowKey);
      }}
      className="size-8 items-center justify-center rounded-sm"
      layerClassName="rounded-sm"
    >
      <Icon name={open ? 'chevronDown' : 'chevronRight'} size={16} tone="variant" />
    </Interactive>
  );
}

function ShareBar({ cpu }: { readonly cpu: number }): ReactNode {
  const filled = Math.min(1, cpu * SHARE_PER_CPU_POINT);
  const fill = { flexGrow: filled, flexBasis: 0, minWidth: 1 } as const;
  const rest = { flexGrow: 1 - filled, flexBasis: 0 } as const;
  return (
    <View aria-hidden className="h-1 flex-row rounded-full bg-surface-3">
      <View style={fill} className="rounded-full bg-viz-1 opacity-60" />
      <View style={rest} />
    </View>
  );
}

function NameBlock({ row }: { readonly row: ProcessRow }): ReactNode {
  const helpers = helpersText(row);
  return (
    <View className="min-w-0 flex-1 flex-row items-center gap-2">
      <Text variant="callout" numberOfLines={1} className="shrink">
        {row.name}
      </Text>
      {helpers === null ? null : (
        <Text variant="caption" tone="variant" numberOfLines={1} className="shrink-0">
          {helpers}
        </Text>
      )}
      {row.state === 'stopped' ? (
        <View className="shrink-0 rounded-full bg-surface-3 px-2 py-0.5">
          <Text variant="caption">Paused</Text>
        </View>
      ) : null}
    </View>
  );
}

function Figure({
  text,
  className,
  tone = 'variant',
}: {
  readonly text: string;
  readonly className: string;
  readonly tone?: 'default' | 'variant';
}): ReactNode {
  return (
    <Text variant="callout" tone={tone} align="end" numberOfLines={1} className={className}>
      {text}
    </Text>
  );
}

function PhoneBody({
  row,
  gpuShown,
}: {
  readonly row: ProcessRow;
  readonly gpuShown: boolean;
}): ReactNode {
  return (
    <View className="min-w-0 flex-1 gap-1">
      <View className="flex-row items-center gap-2">
        <NameBlock row={row} />
        <Figure text={memoryText(row)} className="tabular w-20 shrink-0" />
        <Figure text={cpuText(row)} tone="default" className="tabular w-16 shrink-0" />
      </View>
      <ShareBar cpu={row.cpu} />
      <Text variant="caption" tone="variant" numberOfLines={1} className="tabular">
        {phoneLine(row, gpuShown)}
      </Text>
    </View>
  );
}

function TableBody({ row, full }: { readonly row: ProcessRow; readonly full: boolean }): ReactNode {
  return (
    <View className="min-w-0 flex-1 flex-row items-center gap-2">
      <NameBlock row={row} />
      <Figure text={cpuText(row)} tone="default" className="tabular w-18" />
      <Figure text={memoryText(row)} className="tabular w-21" />
      <Figure text={gpuText(row)} className="tabular w-16" />
      {full ? (
        <>
          <Figure text={diskText(row)} className="tabular w-22" />
          <Figure text={String(row.threads)} className="tabular w-16" />
          <Figure text={userText(row)} className="w-18" />
        </>
      ) : null}
    </View>
  );
}

export const ProcessRowView = memo(function ProcessRowView({
  rowKey,
  row,
  depth,
  open,
  tree,
  layout,
  gpuShown,
  onOpen,
  onToggle,
}: ProcessRowProps): ReactNode {
  const indent = { marginLeft: depth * INDENT } as const;
  return (
    <View className={FRAME[layout]}>
      {tree ? (
        <View style={indent}>
          <Toggle name={row.name} open={open} rowKey={rowKey} onToggle={onToggle} />
        </View>
      ) : null}
      <Interactive
        label={spokenRow(row)}
        onPress={() => {
          onOpen(rowKey);
        }}
        className={cn('min-w-0 flex-1 flex-row items-center self-stretch pr-4', tree ? 'pl-1' : '')}
      >
        {layout === 'phone' ? (
          <PhoneBody row={row} gpuShown={gpuShown} />
        ) : (
          <TableBody row={row} full={layout === 'full'} />
        )}
      </Interactive>
    </View>
  );
});
