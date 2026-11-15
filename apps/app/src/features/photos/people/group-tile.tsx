import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { PhotoGroup } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { FaceAvatar } from './face-avatar';
import { groupLabelOf, groupTitleOf, photosText } from './model';

export function GroupTile({
  group,
  size,
}: {
  readonly group: PhotoGroup;
  readonly size: number;
}): ReactNode {
  const named = group.name !== null || group.kind === 'pet';
  const column = { width: size + 16 };
  return (
    <View style={column}>
      <Interactive
        role="link"
        label={groupLabelOf(group)}
        href={href.photosPerson(group.id)}
        className="items-center gap-1.5 rounded-md p-2"
        layerClassName="rounded-md"
      >
        <FaceAvatar itemId={group.coverItemId} box={group.coverBox} kind={group.kind} size={size} />
        <View className="w-full items-center">
          <Text
            variant="footnote"
            tone={named ? 'default' : 'variant'}
            numberOfLines={1}
            className="font-sans-medium"
          >
            {groupTitleOf(group)}
          </Text>
          <Text variant="caption" tone="variant" numberOfLines={1} className="tabular-nums">
            {photosText(group.count)}
          </Text>
        </View>
      </Interactive>
    </View>
  );
}

export function GroupGrid({
  groups,
  size,
}: {
  readonly groups: readonly PhotoGroup[];
  readonly size: number;
}): ReactNode {
  return (
    <View className="-mx-2 flex-row flex-wrap">
      {groups.map((group) => (
        <GroupTile key={group.id} group={group} size={size} />
      ))}
    </View>
  );
}
