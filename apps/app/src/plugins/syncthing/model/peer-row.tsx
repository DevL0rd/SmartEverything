import { formatByteRate, type SyncthingPeer } from '@smarteverything/domain';
import type { Href } from 'expo-router';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Badge } from '../../../components/badge';
import { Icon } from '../../../components/icon';
import { IconWell } from '../../../components/icon-well';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { STATUS_FILL } from '../../../components/tone';
import { cn } from '../../../design/cn';
import { peerGlyph, peerStatus, peerTone, type PeerTone } from './peer-model';

const DOT_FILL: Readonly<Record<PeerTone, string>> = {
  positive: STATUS_FILL.positive,
  warning: STATUS_FILL.warning,
  neutral: 'bg-surface-1',
};

function PeerMark({
  peer,
  stale,
}: {
  readonly peer: SyncthingPeer;
  readonly stale: boolean;
}): ReactNode {
  const tone = stale ? 'neutral' : peerTone(peer);
  return (
    <View className="relative shrink-0">
      <IconWell icon={peerGlyph(peer.name)} colour="viz-1" size="m" />
      <View
        aria-hidden
        className={cn(
          'absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2',
          tone === 'neutral' ? 'border-on-surface-variant' : 'border-surface-1',
          DOT_FILL[tone],
        )}
      />
    </View>
  );
}

export function PeerRow({
  peer,
  now,
  stale,
  onPress,
  href,
}: {
  readonly peer: SyncthingPeer;
  readonly now: number;
  readonly stale: boolean;
  readonly onPress?: () => void;
  readonly href?: Href;
}): ReactNode {
  const status = peerStatus(peer, now, stale);
  const live = !stale && peer.connected && peer.inBytesPerSecond > 0;
  return (
    <Interactive
      label={`${peer.name}, ${status}${peer.overdue ? ', away too long' : ''}`}
      className="min-h-row-h-2 flex-row items-center gap-4 px-4 py-2"
      onPress={onPress}
      href={href}
    >
      <PeerMark peer={peer} stale={stale} />
      <View className="min-w-0 flex-1 gap-0.5">
        <Text variant="body" numberOfLines={1}>
          {peer.name}
        </Text>
        <Text variant="callout" tone="variant" numberOfLines={1}>
          {status}
        </Text>
        {peer.overdue ? <Badge label="Away too long" tone="warning" icon="warning" /> : null}
      </View>
      {live ? (
        <Text variant="footnote" tone="variant" className="tabular">
          {`↓ ${formatByteRate(peer.inBytesPerSecond)}`}
        </Text>
      ) : null}
      <Icon name="chevronRight" size={20} tone="faint" />
    </Interactive>
  );
}
