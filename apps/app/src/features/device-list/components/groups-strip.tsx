import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { HScroller } from '../../../components/h-scroller';
import { Text } from '../../../components/text';
import { useStoreSelector } from '../../../store/store-context';
import { DeviceGroupCard } from '../../device-groups';

const CARD_STYLE = { width: 256 } as const;

export function GroupsStrip(): ReactNode {
  const groups = useStoreSelector((state) => state.tables.device_groups.rows);
  return (
    <View className="gap-2">
      <Text variant="footnote" tone="variant">
        Groups
      </Text>
      <HScroller label="Groups">
        {groups.map((group) => (
          <View key={group.id} style={CARD_STYLE}>
            <DeviceGroupCard
              target={{ kind: 'group', groupId: group.id }}
              title={group.name}
              href={href.group(group.id)}
            />
          </View>
        ))}
        <Button label="New group" icon="plus" variant="tonal" size="lg" href={href.newGroup()} />
      </HScroller>
    </View>
  );
}
