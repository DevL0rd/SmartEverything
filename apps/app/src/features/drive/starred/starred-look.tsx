import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../../components/text';
import { bytes } from '../../../format/number';
import { joinParts } from '../../../format/text';
import { shortDate } from '../../../format/time';
import { FileRow, type FileBrowserHandle } from '../../files';
import { DriveChipBadge } from '../components/drive-chip';
import type { DriveChip } from '../model/drive-chip';
import type { DriveNode, DriveOrigin } from '../source/drive-node';

export interface StarredFileRowProps {
  readonly node: DriveNode;
  readonly browser: FileBrowserHandle<DriveOrigin>;
  readonly chip: DriveChip;
  readonly where: string;
  readonly wide: boolean;
}

function Column({
  text,
  className,
}: {
  readonly text: string;
  readonly className: string;
}): ReactNode {
  return (
    <Text variant="callout" tone="variant" numberOfLines={1} className={className}>
      {text}
    </Text>
  );
}

function sizeOf(node: DriveNode): string {
  return node.size === null ? '—' : bytes(node.size);
}

function WideColumns({
  node,
  chip,
  where,
}: Omit<StarredFileRowProps, 'browser' | 'wide'>): ReactNode {
  return (
    <View className="flex-row items-center gap-4">
      <View className="w-36 items-start">
        <DriveChipBadge chip={chip} />
      </View>
      <Column text={where} className="w-44" />
      <Column
        text={node.modifiedAt === null ? '—' : shortDate(node.modifiedAt)}
        className="tabular w-20 text-right"
      />
      <Column text={sizeOf(node)} className="tabular w-20 text-right" />
    </View>
  );
}

export function StarredFileRow(props: StarredFileRowProps): ReactNode {
  const { node, browser, chip, where, wide } = props;
  return (
    <FileRow
      node={node}
      browser={browser}
      wide={wide}
      look={
        wide
          ? { caption: null, trailing: <WideColumns node={node} chip={chip} where={where} /> }
          : { caption: joinParts([chip.label, where, sizeOf(node)]), trailing: null }
      }
    />
  );
}
