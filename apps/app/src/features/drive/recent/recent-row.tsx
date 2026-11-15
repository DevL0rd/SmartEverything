import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../../components/text';
import { useColour } from '../../../design/colour';
import type { ColourRole } from '../../../design/tokens';
import { joinParts } from '../../../format/text';
import { FileRow, type FileBrowserHandle } from '../../files';
import { DriveCells } from '../components/drive-columns';
import { DriveChipBadge } from '../components/drive-chip';
import type { DriveChip } from '../model/drive-chip';
import type { DriveColumn, PlacedColumn } from '../model/drive-columns';
import type { DriveNode, DriveOrigin } from '../source/drive-node';
import type { RecentHow } from './recent-how';

export interface RecentRowProps {
  readonly node: DriveNode;
  readonly browser: FileBrowserHandle<DriveOrigin>;
  readonly how: RecentHow;
  readonly chip: DriveChip;
  readonly where: string;
  readonly time: string;
  readonly columns: RecentColumns;
}

export type RecentColumnKey = 'drive' | 'how' | 'when';

export type RecentColumns = readonly PlacedColumn<RecentColumnKey>[] | null;

export const RECENT_COLUMNS: readonly DriveColumn<RecentColumnKey>[] = [
  { key: 'drive', title: 'Drive', width: 144 },
  { key: 'how', title: 'What happened', width: 160, maxWidth: 288 },
  { key: 'when', title: 'When', width: 64, end: true },
];

function ActorDot({ colour }: { readonly colour: ColourRole }): ReactNode {
  const fill = { backgroundColor: useColour(colour) };
  return <View aria-hidden style={fill} className="size-2 rounded-full" />;
}

function cellOf({
  how,
  chip,
  time,
}: Pick<RecentRowProps, 'how' | 'chip' | 'time'>): (
  column: PlacedColumn<RecentColumnKey>,
) => ReactNode {
  return function RecentCell(column) {
    switch (column.key) {
      case 'drive':
        return <DriveChipBadge chip={chip} />;
      case 'how':
        return (
          <View className="w-full flex-row items-center gap-2">
            <ActorDot colour={how.colour} />
            <Text variant="callout" tone="variant" numberOfLines={1} className="min-w-0 shrink">
              {how.text}
            </Text>
          </View>
        );
      case 'when':
        return (
          <Text variant="callout" tone="variant" numberOfLines={1} className="tabular">
            {time}
          </Text>
        );
    }
  };
}

function CompactTrailing({
  how,
  chip,
  time,
}: Pick<RecentRowProps, 'how' | 'chip' | 'time'>): ReactNode {
  return (
    <View className="items-end gap-1">
      <View className="flex-row items-center gap-1.5">
        <ActorDot colour={how.colour} />
        <Text variant="footnote" tone="variant" numberOfLines={1} className="tabular">
          {time}
        </Text>
      </View>
      <DriveChipBadge chip={chip} />
    </View>
  );
}

export function RecentRow({
  node,
  browser,
  how,
  chip,
  where,
  time,
  columns,
}: RecentRowProps): ReactNode {
  const caption = columns === null ? joinParts([how.text, where]) : where;
  return (
    <FileRow
      node={node}
      browser={browser}
      wide={columns !== null}
      look={{
        caption: caption === '' ? null : caption,
        trailing:
          columns === null ? (
            <CompactTrailing how={how} chip={chip} time={time} />
          ) : (
            <DriveCells columns={columns} cell={cellOf({ how, chip, time })} />
          ),
      }}
    />
  );
}
