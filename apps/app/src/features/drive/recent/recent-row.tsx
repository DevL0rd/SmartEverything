import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../../components/text';
import { useColour } from '../../../design/colour';
import type { ColourRole } from '../../../design/tokens';
import { joinParts } from '../../../format/text';
import { FileRow, type FileBrowserHandle } from '../../files';
import { DriveChipBadge } from '../components/drive-chip';
import type { DriveChip } from '../model/drive-chip';
import type { DriveNode, DriveOrigin } from '../source/drive-node';
import type { RecentHow } from './recent-how';

export interface RecentRowProps {
  readonly node: DriveNode;
  readonly browser: FileBrowserHandle<DriveOrigin>;
  readonly how: RecentHow;
  readonly chip: DriveChip;
  readonly where: string;
  readonly time: string;
  readonly wide: boolean;
}

function ActorDot({ colour }: { readonly colour: ColourRole }): ReactNode {
  const fill = { backgroundColor: useColour(colour) };
  return <View aria-hidden style={fill} className="size-2 rounded-full" />;
}

function WideTrailing({
  how,
  chip,
  time,
}: Pick<RecentRowProps, 'how' | 'chip' | 'time'>): ReactNode {
  return (
    <View className="flex-row items-center gap-4">
      <View className="w-36 items-start">
        <DriveChipBadge chip={chip} />
      </View>
      <View className="w-56 flex-row items-center gap-2">
        <ActorDot colour={how.colour} />
        <Text variant="callout" tone="variant" numberOfLines={1} className="min-w-0 shrink">
          {how.text}
        </Text>
      </View>
      <Text variant="callout" tone="variant" numberOfLines={1} className="w-16 text-right tabular">
        {time}
      </Text>
    </View>
  );
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
  wide,
}: RecentRowProps): ReactNode {
  const caption = wide ? where : joinParts([how.text, where]);
  return (
    <FileRow
      node={node}
      browser={browser}
      wide={wide}
      look={{
        caption: caption === '' ? null : caption,
        trailing: wide ? (
          <WideTrailing how={how} chip={chip} time={time} />
        ) : (
          <CompactTrailing how={how} chip={chip} time={time} />
        ),
      }}
    />
  );
}
