import { memo, type ReactNode } from 'react';
import { View } from 'react-native';
import type { DriveItem } from '@smarteverything/domain';
import { IconButton } from '../../../components/icon-button';
import { IconWell } from '../../../components/icon-well';
import { ListRow } from '../../../components/list-row';
import { Text } from '../../../components/text';
import { bytes } from '../../../format/number';
import { joinParts } from '../../../format/text';
import { shortDate } from '../../../format/time';
import { DriveThumb } from '../folder/folder-list';
import { useDriveRoots } from '../data';
import { DriveChipBadge } from '../components/drive-chip';
import type { DriveChip } from '../model/drive-chip';
import { KIND_LOOK, openHrefOf } from '../recent/recent-model';

export interface StarredRowProps {
  readonly item: DriveItem;
  readonly chip: DriveChip;
  readonly where: string;
  readonly wide: boolean;
  readonly live: boolean;
  readonly onUnstar: (item: DriveItem) => void;
}

export function sizeText(item: DriveItem): string {
  return bytes(item.bytes);
}

function Leading({ item, wide }: { readonly item: DriveItem; readonly wide: boolean }): ReactNode {
  if (item.kind !== 'folder' && item.thumb.state === 'ready') {
    return (
      <DriveThumb item={item} className={wide ? 'h-6 w-8 rounded-xs' : 'size-10 rounded-sm'} />
    );
  }
  const look = KIND_LOOK[item.kind];
  return <IconWell icon={look.icon} colour={look.colour} size={wide ? 's' : 'm'} />;
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

function Unstar({
  item,
  live,
  onUnstar,
}: Pick<StarredRowProps, 'item' | 'live' | 'onUnstar'>): ReactNode {
  return (
    <IconButton
      icon="star"
      tone="warning"
      label={`Remove the star from ${item.name}`}
      disabled={!live}
      onPress={() => {
        onUnstar(item);
      }}
    />
  );
}

export const StarredRow = memo(function StarredRow(props: StarredRowProps): ReactNode {
  const { item, chip, where, wide } = props;
  const roots = useDriveRoots();
  const size = sizeText(item);
  const subtitle = wide ? null : joinParts([chip.label, where, size]);
  return (
    <ListRow
      title={item.name}
      leading={<Leading item={item} wide={wide} />}
      href={openHrefOf(item, roots)}
      label={joinParts([`Open ${item.name}`, chip.label, where, size])}
      contextMenu={[
        {
          label: 'Remove star',
          icon: 'star',
          disabled: !props.live,
          onPress: (): void => {
            props.onUnstar(item);
          },
        },
      ]}
      trailing={
        wide ? (
          <View className="flex-row items-center gap-4">
            <View className="w-36 items-start">
              <DriveChipBadge chip={chip} />
            </View>
            <Column text={where} className="w-44" />
            <Column text={shortDate(item.modifiedAt)} className="tabular w-20 text-right" />
            <Column text={size} className="tabular w-20 text-right" />
            <Unstar item={item} live={props.live} onUnstar={props.onUnstar} />
          </View>
        ) : (
          <Unstar item={item} live={props.live} onUnstar={props.onUnstar} />
        )
      }
      {...(subtitle === null || subtitle === '' ? {} : { subtitle })}
    />
  );
});
