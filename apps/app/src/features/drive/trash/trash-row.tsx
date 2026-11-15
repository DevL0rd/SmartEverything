import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Arc } from '../../../components/charts';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { initialsOf } from '../../../format/text';
import type { PersonTone } from './deleted-by';
import { useToneColour } from './tone-colour';
import { TABLE_COLUMNS, type TrashLayout } from './trash-layout';
import { deleterName, leavesText, sizeText, type TrashItem } from './trash-model';
import { FileRow, type FileBrowserHandle } from '../../files';
import type { DriveNode, DriveOrigin } from '../source/drive-node';

export interface TrashRowProps {
  readonly item: TrashItem;
  readonly node: DriveNode;
  readonly browser: FileBrowserHandle<DriveOrigin>;
  readonly wasIn: string;
  readonly tone: PersonTone;
  readonly layout: TrashLayout;
}

type Part = Pick<TrashRowProps, 'item' | 'wasIn' | 'tone' | 'layout'>;

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

function captionOf({ item, wasIn, layout }: Part): string | null {
  if (layout === 'table') return null;
  const by = deleterName(item.deleter);
  return wasIn === '' ? by : `${by} · ${wasIn}`;
}

export function TrashRow(props: TrashRowProps): ReactNode {
  const { node, browser, layout } = props;
  return (
    <FileRow
      node={node}
      browser={browser}
      wide={layout === 'table'}
      look={{
        caption: captionOf(props),
        trailing: (
          <View className="flex-row items-center gap-3">
            <Columns item={props.item} wasIn={props.wasIn} tone={props.tone} layout={layout} />
          </View>
        ),
      }}
    />
  );
}
