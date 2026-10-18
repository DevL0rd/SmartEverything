import { formatByteRate, type SyncthingFolder, type SyncthingPeer } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Arc } from '../../../components/charts';
import { DotStrip, type Dot } from '../../../components/dot-strip';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { useColour } from '../../../design/colour';
import { plural } from '../../../format/text';
import { ringShare } from '../model/completion';
import { folderState, type FolderState } from '../model/folder-model';
import { FolderRing } from '../model/folder-ring';
import { syncSectionHref } from '../model/links';
import { peerStateWord, peerTone } from '../model/peer-model';
import { invitationCount, shortStateOf, type StaleCaption, type SyncStatus } from './sync-model';
import type { SyncReady } from './sync-widget-frame';

const PEER_DOTS_MAX = 12;

export function StaleLine({
  stale,
  short = false,
}: {
  readonly stale: StaleCaption;
  readonly short?: boolean;
}): ReactNode {
  return (
    <View className="flex-row items-center gap-1">
      {stale.critical ? <Icon name="warning" size={16} tone="critical" /> : null}
      <Text
        variant="footnote"
        tone={stale.critical ? 'critical' : 'variant'}
        numberOfLines={1}
        className="shrink"
        accessibilityLabel={stale.long}
      >
        {short ? stale.short : stale.long}
      </Text>
    </View>
  );
}

export function Rates({
  status,
  ready,
}: {
  readonly status: SyncStatus;
  readonly ready: SyncReady;
}): ReactNode {
  const { summary, ratesLive } = ready.snapshot;
  return ratesLive ? (
    <Text variant="footnote" tone="variant" numberOfLines={1} className="tabular">
      {`↓ ${formatByteRate(summary.downloadBytesPerSecond)}  ↑ ${formatByteRate(summary.uploadBytesPerSecond)}`}
    </Text>
  ) : (
    <Text variant="footnote" tone="variant" numberOfLines={1}>
      {status.left}
    </Text>
  );
}

const CHIP_RING = 20;
const CHIP_RING_THICKNESS = 3;

function ChipRing({ state }: { readonly state: FolderState }): ReactNode {
  return (
    <View aria-hidden className="shrink-0">
      <Arc
        value={ringShare(state.percent)}
        size={CHIP_RING}
        thickness={CHIP_RING_THICKNESS}
        colour={state.tone}
        trackColour="outline"
      />
    </View>
  );
}

export function FolderChip({ folder }: { readonly folder: SyncthingFolder }): ReactNode {
  const state = folderState(folder);
  return (
    <View
      accessible
      accessibilityLabel={`${folder.label}, ${state.text}`}
      className="min-h-6 max-w-36 flex-none flex-row items-center gap-1.5 rounded-full border-hairline border-outline bg-surface-2 px-2.5"
    >
      <ChipRing state={state} />
      <Text variant="caption" numberOfLines={1} className="shrink">
        {folder.label}
      </Text>
    </View>
  );
}

export function FolderLink({
  folder,
  ready,
  detail = true,
}: {
  readonly folder: SyncthingFolder;
  readonly ready: SyncReady;
  readonly detail?: boolean;
}): ReactNode {
  const state = folderState(folder);
  return (
    <Interactive
      href={syncSectionHref(ready.device.id, 'folders', { folder: folder.id })}
      label={`${folder.label}, ${state.text}`}
      className="min-h-touch-min flex-row items-center gap-2"
    >
      <View aria-hidden>
        <FolderRing state={state} size={28} label={folder.label} />
      </View>
      <Text variant="callout" numberOfLines={1} className="min-w-0 flex-1">
        {folder.label}
      </Text>
      {detail ? (
        <Text variant="caption" tone={state.tone === 'critical' ? 'critical' : 'variant'}>
          {shortStateOf(state)}
        </Text>
      ) : null}
    </Interactive>
  );
}

export function MoreLink({
  count,
  ready,
  noun,
  section,
}: {
  readonly count: number;
  readonly ready: SyncReady;
  readonly noun: string;
  readonly section: 'folders' | 'devices';
}): ReactNode {
  return (
    <Interactive
      href={syncSectionHref(ready.device.id, section)}
      label={`${String(count)} more ${noun}`}
      className="min-h-touch-min justify-center"
    >
      <Text variant="footnote" tone="variant">
        {`+${String(count)} more`}
      </Text>
    </Interactive>
  );
}

export function InviteLine({ ready }: { readonly ready: SyncReady }): ReactNode {
  const count = invitationCount(ready.snapshot);
  return count === 0 ? null : (
    <Interactive
      href={href.device(ready.device)}
      label={plural(count, 'invitation')}
      className="min-h-touch-min justify-center"
    >
      <Text variant="footnote" tone="info" numberOfLines={1}>
        {plural(count, 'invitation')}
      </Text>
    </Interactive>
  );
}

function dotOf(peer: SyncthingPeer, positive: string, warning: string): Dot {
  const tone = peerTone(peer);
  if (tone === 'neutral') {
    return { key: peer.id, colour: null, state: 'off' };
  }
  return { key: peer.id, colour: tone === 'warning' ? warning : positive, state: 'on' };
}

export function PeerDots({ ready }: { readonly ready: SyncReady }): ReactNode {
  const positive = useColour('positive');
  const warning = useColour('warning');
  const { peers, summary } = ready.snapshot;
  return peers.length === 0 ? null : (
    <Interactive
      href={syncSectionHref(ready.device.id, 'devices')}
      label={`${String(summary.peersOnline)} of ${plural(summary.peersTotal, 'device')} connected`}
      className="min-h-touch-min justify-center"
    >
      <DotStrip dots={peers.map((peer) => dotOf(peer, positive, warning))} max={PEER_DOTS_MAX} />
    </Interactive>
  );
}

export function PeerLink({
  peer,
  ready,
}: {
  readonly peer: SyncthingPeer;
  readonly ready: SyncReady;
}): ReactNode {
  const positive = useColour('positive');
  const warning = useColour('warning');
  const standing = peerStateWord(peer);
  return (
    <Interactive
      href={syncSectionHref(ready.device.id, 'devices')}
      label={`${peer.name}, ${standing}`}
      className="min-h-touch-min flex-row items-center gap-2"
    >
      <DotStrip dots={[dotOf(peer, positive, warning)]} />
      <Text variant="callout" numberOfLines={1} className="min-w-0 flex-1">
        {peer.name}
      </Text>
      <Text variant="caption" tone="variant" className="flex-none">
        {standing}
      </Text>
    </Interactive>
  );
}
