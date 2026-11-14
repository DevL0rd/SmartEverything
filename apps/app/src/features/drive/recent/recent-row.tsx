import { memo, type ReactNode } from 'react';
import { View } from 'react-native';
import { IconWell } from '../../../components/icon-well';
import { ListRow } from '../../../components/list-row';
import { Text } from '../../../components/text';
import { useColour } from '../../../design/colour';
import type { ColourRole } from '../../../design/tokens';
import { joinParts } from '../../../format/text';
import type { RecentHow } from './recent-how';
import { useDriveRoots } from '../data';
import { DriveChipBadge } from '../components/drive-chip';
import type { DriveChip } from '../model/drive-chip';
import { KIND_LOOK, openHrefOf, type RecentLine } from './recent-model';

export interface RecentRowProps {
  readonly line: RecentLine;
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

export const RecentRow = memo(function RecentRow({
  line,
  how,
  chip,
  where,
  time,
  wide,
}: RecentRowProps): ReactNode {
  const { item } = line.entry;
  const roots = useDriveRoots();
  const look = KIND_LOOK[item.kind];
  const subtitle = wide ? where : joinParts([how.text, where]);
  return (
    <ListRow
      title={item.name}
      leading={<IconWell icon={look.icon} colour={look.colour} size={wide ? 's' : 'm'} />}
      href={openHrefOf(item, roots)}
      label={joinParts([item.name, how.text, chip.label, where, time])}
      trailing={
        wide ? (
          <WideTrailing how={how} chip={chip} time={time} />
        ) : (
          <CompactTrailing how={how} chip={chip} time={time} />
        )
      }
      {...(subtitle === '' ? {} : { subtitle })}
    />
  );
});
