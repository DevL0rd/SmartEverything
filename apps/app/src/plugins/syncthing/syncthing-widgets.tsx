import { formatByteRate, type SyncthingSnapshot } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { ProgressBar } from '../../components/charts';
import { Text } from '../../components/text';
import type { BoardClass, WidgetDefinition, WidgetSize } from '../../components/widget-board';
import { bytes } from '../../format/number';
import { joinParts, plural } from '../../format/text';
import { PluginWidgetFrame } from '../shared/plugin-widget';
import {
  SYNC_STATE_TEXT,
  syncthingNotice,
  useSyncthingDevice,
  useSyncthingSnapshot,
} from './syncthing-data';

const SIZES: Readonly<Record<BoardClass, readonly WidgetSize[]>> = {
  compact: ['S', 'M', 'L'],
  medium: ['S', 'M', 'L'],
  expanded: ['S', 'M', 'W', 'L'],
};

const SHOWN: Readonly<Record<WidgetSize, number>> = { S: 1, M: 3, W: 4, L: 6, XL: 8 };

function unavailable(snapshot: SyncthingSnapshot): string | null {
  return syncthingNotice(snapshot)?.title ?? null;
}

function HealthWidget({ size }: { readonly size: WidgetSize }): ReactNode {
  return (
    <PluginWidgetFrame
      title="Sync"
      icon="folderSync"
      accent="primary"
      size={size}
      device={useSyncthingDevice()}
      stream={useSyncthingSnapshot()}
      unavailable={unavailable}
    >
      {({ summary, attention, pendingDevices, pendingFolders }) => {
        const state = SYNC_STATE_TEXT[summary.state];
        const invites = pendingDevices.length + pendingFolders.length;
        return (
          <View className="gap-1">
            <Text variant="title-3" tone={state.tone} numberOfLines={1}>
              {state.title}
            </Text>
            <Text variant="footnote" tone="variant" numberOfLines={2}>
              {joinParts([
                summary.needBytes > 0 ? `${bytes(summary.needBytes)} left` : null,
                attention.length > 0 ? plural(attention.length, 'problem') : null,
                invites > 0 ? plural(invites, 'invitation') : null,
              ]) ||
                `${String(summary.peersOnline)} of ${plural(summary.peersTotal, 'device')} connected`}
            </Text>
          </View>
        );
      }}
    </PluginWidgetFrame>
  );
}

function FoldersWidget({ size }: { readonly size: WidgetSize }): ReactNode {
  return (
    <PluginWidgetFrame
      title="Synced folders"
      icon="folder"
      accent="viz-3"
      size={size}
      device={useSyncthingDevice()}
      stream={useSyncthingSnapshot()}
      unavailable={(snapshot) =>
        unavailable(snapshot) ?? (snapshot.folders.length === 0 ? 'No synced folders' : null)
      }
    >
      {({ folders }) => (
        <View className="gap-2">
          {[...folders]
            .sort((left, right) => left.completionPercent - right.completionPercent)
            .slice(0, SHOWN[size])
            .map((folder) => (
              <View key={folder.id} className="gap-1">
                <Text variant="footnote" numberOfLines={1}>
                  {folder.paused ? `${folder.label} · paused` : folder.label}
                </Text>
                <ProgressBar
                  progress={folder.completionPercent / 100}
                  colour="primary"
                  label={`${folder.label} progress`}
                />
              </View>
            ))}
        </View>
      )}
    </PluginWidgetFrame>
  );
}

function PeersWidget({ size }: { readonly size: WidgetSize }): ReactNode {
  return (
    <PluginWidgetFrame
      title="Sync devices"
      icon="monitor"
      accent="viz-4"
      size={size}
      device={useSyncthingDevice()}
      stream={useSyncthingSnapshot()}
      unavailable={(snapshot) =>
        unavailable(snapshot) ?? (snapshot.peers.length === 0 ? 'No other devices' : null)
      }
    >
      {({ peers, summary, ratesLive }) => (
        <View className="gap-1">
          <Text variant="title-3" numberOfLines={1}>
            {`${String(summary.peersOnline)} of ${String(summary.peersTotal)} online`}
          </Text>
          {peers.slice(0, SHOWN[size] - 1).map((peer) => (
            <Text
              key={peer.id}
              variant="footnote"
              tone={peer.connected ? 'default' : 'faint'}
              numberOfLines={1}
            >
              {joinParts([
                peer.name,
                peer.connected && ratesLive ? `↓ ${formatByteRate(peer.inBytesPerSecond)}` : null,
                peer.overdue ? 'away too long' : null,
              ])}
            </Text>
          ))}
        </View>
      )}
    </PluginWidgetFrame>
  );
}

export const SYNCTHING_WIDGETS: readonly WidgetDefinition[] = [
  {
    type: 'syncthing.health',
    title: 'Sync',
    icon: 'folderSync',
    group: 'Files',
    sizes: SIZES,
    defaultSize: 'S',
    render: ({ size }) => <HealthWidget size={size} />,
  },
  {
    type: 'syncthing.folders',
    title: 'Synced folders',
    icon: 'folder',
    group: 'Files',
    sizes: SIZES,
    defaultSize: 'M',
    render: ({ size }) => <FoldersWidget size={size} />,
  },
  {
    type: 'syncthing.devices',
    title: 'Sync devices',
    icon: 'monitor',
    group: 'Files',
    sizes: SIZES,
    defaultSize: 'M',
    render: ({ size }) => <PeersWidget size={size} />,
  },
];
