import type { ReactNode } from 'react';
import { Text } from '../../../components/text';
import { bytes } from '../../../format/number';
import { joinParts } from '../../../format/text';
import { shortDate } from '../../../format/time';
import { FileRow, type FileBrowserHandle } from '../../files';
import { DriveCells } from '../components/drive-columns';
import { DriveChipBadge } from '../components/drive-chip';
import type { DriveChip } from '../model/drive-chip';
import { hasColumn, type DriveColumn, type PlacedColumn } from '../model/drive-columns';
import type { DriveNode, DriveOrigin } from '../source/drive-node';

export type StarredColumnKey = 'drive' | 'in' | 'changed' | 'size';

export type StarredColumns = readonly PlacedColumn<StarredColumnKey>[] | null;

const DRIVE: DriveColumn<StarredColumnKey> = { key: 'drive', title: 'Drive', width: 144 };
const IN: DriveColumn<StarredColumnKey> = {
  key: 'in',
  title: 'In',
  width: 176,
  maxWidth: 280,
  optional: true,
};
const CHANGED: DriveColumn<StarredColumnKey> = {
  key: 'changed',
  title: 'Changed',
  width: 80,
  end: true,
};
const SIZE: DriveColumn<StarredColumnKey> = { key: 'size', title: 'Size', width: 80, end: true };

export function starredColumnsOf(trails: boolean): readonly DriveColumn<StarredColumnKey>[] {
  return trails ? [DRIVE, IN, CHANGED, SIZE] : [DRIVE, CHANGED, SIZE];
}

export interface StarredFileRowProps {
  readonly node: DriveNode;
  readonly browser: FileBrowserHandle<DriveOrigin>;
  readonly chip: DriveChip;
  readonly where: string;
  readonly columns: StarredColumns;
}

function Column({ text, end }: { readonly text: string; readonly end: boolean }): ReactNode {
  return (
    <Text
      variant="callout"
      tone="variant"
      numberOfLines={1}
      align={end ? 'end' : 'start'}
      className="tabular w-full"
    >
      {text}
    </Text>
  );
}

function sizeOf(node: DriveNode): string {
  return node.size === null ? '—' : bytes(node.size);
}

function cellOf(
  node: DriveNode,
  chip: DriveChip,
  where: string,
): (column: PlacedColumn<StarredColumnKey>) => ReactNode {
  return function StarredCell(column) {
    switch (column.key) {
      case 'drive':
        return <DriveChipBadge chip={chip} />;
      case 'in':
        return <Column text={where === '' ? '—' : where} end={false} />;
      case 'changed':
        return <Column text={node.modifiedAt === null ? '—' : shortDate(node.modifiedAt)} end />;
      case 'size':
        return <Column text={sizeOf(node)} end />;
    }
  };
}

export function StarredFileRow(props: StarredFileRowProps): ReactNode {
  const { node, browser, chip, where, columns } = props;
  if (columns === null) {
    return (
      <FileRow
        node={node}
        browser={browser}
        wide={false}
        look={{ caption: joinParts([chip.label, where, sizeOf(node)]), trailing: null }}
      />
    );
  }
  return (
    <FileRow
      node={node}
      browser={browser}
      wide
      look={{
        caption: hasColumn(columns, 'in') || where === '' ? null : where,
        trailing: <DriveCells columns={columns} cell={cellOf(node, chip, where)} />,
      }}
    />
  );
}
