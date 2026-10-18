import type { SyncthingPeer } from '@smarteverything/domain';
import type { Href } from 'expo-router';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Section } from '../../../components/section';
import { Text } from '../../../components/text';

export function PeerChips({
  peers,
  href,
}: {
  readonly peers: readonly SyncthingPeer[];
  readonly href: (id: string) => Href;
}): ReactNode {
  return (
    <Section title="Shared with">
      <View className="flex-row flex-wrap gap-2 px-4">
        {peers.map((peer) => (
          <Interactive
            key={peer.id}
            href={href(peer.id)}
            label={peer.name}
            className="min-h-touch-min max-w-72 flex-row items-center gap-1.5 rounded-full border-hairline border-outline-variant bg-surface-1 pl-3 pr-2"
            layerClassName="rounded-full"
          >
            <Text variant="label" numberOfLines={1} className="shrink">
              {peer.name}
            </Text>
            <Icon name="chevronRight" size={16} tone="variant" />
          </Interactive>
        ))}
      </View>
    </Section>
  );
}
