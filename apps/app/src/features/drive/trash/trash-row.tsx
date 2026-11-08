import { memo, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Arc } from '../../../components/charts';
import { FileGlyph } from '../../../components/files/file-glyph';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { initialsOf } from '../../../format/text';
import type { PersonTone } from './deleted-by';
import type { PickState } from './selection';
import { useToneColour } from './tone-colour';
import { TABLE_COLUMNS, type TrashLayout } from './trash-layout';
import { deleterName, leavesText, rowLabelOf, sizeText, type TrashItem } from './trash-model';

export interface TrashRowProps {
  readonly item: TrashItem;
  readonly wasIn: string;
  readonly tone: PersonTone;
  readonly layout: TrashLayout;
  readonly picked: boolean;
  readonly disabled: boolean;
  readonly onToggle: (item: TrashItem) => void;
  readonly onRestore: (item: TrashItem) => void;
}

type Part = Pick<TrashRowProps, 'item' | 'wasIn' | 'tone' | 'layout'>;

export function CheckMark({ state }: { readonly state: PickState }): ReactNode {
  return (
    <View
      aria-hidden
      className={cn(
        'size-5 shrink-0 items-center justify-center rounded-xs border-2',
        state === false ? 'border-on-surface-variant' : 'border-primary bg-primary',
      )}
    >
      {state === false ? null : (
        <Icon name={state === 'mixed' ? 'minus' : 'check'} size={16} tone="onPrimary" />
      )}
    </View>
  );
}

function Avatar({ item, tone }: Pick<Part, 'item' | 'tone'>): ReactNode {
  const fill = { backgroundColor: useToneColour()(tone) };
  return (
    <View aria-hidden style={fill} className="size-6 items-center justify-center rounded-full">
      {item.deleter.kind === 'unknown' ? (
        <Icon name="user" size={16} tone="onPrimary" />
      ) : (
        <Text variant="caption" tone="onPrimary">
          {initialsOf(deleterName(item.deleter))}
        </Text>
      )}
    </View>
  );
}

function LeavesIn({ item, layout }: Pick<Part, 'item' | 'layout'>): ReactNode {
  const compact = layout === 'compact';
  return (
    <View
      className={cn(
        'items-center',
        compact ? 'w-14 gap-0.5' : cn(TABLE_COLUMNS.leaves, 'flex-row gap-2'),
      )}
    >
      <Arc value={item.kept} size={compact ? 20 : 16} thickness={3} colour="on-surface-variant" />
      <Text variant={compact ? 'caption' : 'callout'} tone="variant" numberOfLines={1}>
        {leavesText(item.daysLeft, compact)}
      </Text>
    </View>
  );
}

function TableColumns({ item, wasIn, tone }: Part): ReactNode {
  return (
    <>
      <Text variant="callout" tone="variant" numberOfLines={1} className={TABLE_COLUMNS.wasIn}>
        {wasIn}
      </Text>
      <View className={cn(TABLE_COLUMNS.deletedBy, 'flex-row items-center gap-2')}>
        <Avatar item={item} tone={tone} />
        <Text variant="callout" tone="variant" numberOfLines={1} className="min-w-0 shrink">
          {deleterName(item.deleter)}
        </Text>
      </View>
    </>
  );
}

function Names({ item, wasIn, tone, layout }: Part): ReactNode {
  const by = deleterName(item.deleter);
  return (
    <View className="min-w-0 flex-1">
      <Text variant={layout === 'compact' ? 'body' : 'callout'} numberOfLines={1}>
        {item.name}
      </Text>
      {layout === 'table' ? null : (
        <View className="flex-row items-center gap-1.5">
          {layout === 'list' ? <Avatar item={item} tone={tone} /> : null}
          <Text variant="footnote" tone="variant" numberOfLines={1} className="min-w-0 shrink">
            {wasIn === '' ? by : `${by} · ${wasIn}`}
          </Text>
        </View>
      )}
    </View>
  );
}

function Columns(part: Part): ReactNode {
  if (part.layout === 'compact') return <LeavesIn item={part.item} layout="compact" />;
  return (
    <>
      {part.layout === 'table' ? <TableColumns {...part} /> : null}
      <Text
        variant="callout"
        tone="variant"
        align="end"
        className={cn('tabular', TABLE_COLUMNS.size)}
      >
        {sizeText(part.item)}
      </Text>
      <LeavesIn item={part.item} layout={part.layout} />
    </>
  );
}

function RestoreButton({
  item,
  disabled,
  onRestore,
}: Pick<TrashRowProps, 'item' | 'disabled' | 'onRestore'>): ReactNode {
  return (
    <View className={cn(TABLE_COLUMNS.restore, 'items-end')}>
      <Button
        label="Restore"
        variant="outlined"
        disabled={disabled}
        onPress={() => {
          onRestore(item);
        }}
      />
    </View>
  );
}

export const TrashRow = memo(function TrashRow(props: TrashRowProps): ReactNode {
  const { item, wasIn, layout, picked, onToggle } = props;
  const compact = layout === 'compact';
  return (
    <View
      className={cn(
        'flex-row items-center border-t border-outline-variant',
        compact ? 'h-18 px-4' : 'h-14 pl-4 pr-3',
        picked && 'bg-primary-container',
      )}
    >
      <Interactive
        role="checkbox"
        checked={picked}
        label={rowLabelOf(item, wasIn)}
        onPress={() => {
          onToggle(item);
        }}
        className="min-w-0 flex-1 flex-row items-center gap-3 self-stretch"
      >
        <CheckMark state={picked} />
        <FileGlyph kind={item.isFolder ? 'folder' : 'file'} name={item.name} well="s" />
        <Names item={item} wasIn={wasIn} tone={props.tone} layout={layout} />
        <Columns item={item} wasIn={wasIn} tone={props.tone} layout={layout} />
      </Interactive>
      {compact ? null : (
        <RestoreButton item={item} disabled={props.disabled} onRestore={props.onRestore} />
      )}
    </View>
  );
});
