import type { SyncthingFolder } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../../components/text';
import { useWidgetFace } from '../../../components/widget-board/use-widget-face';
import { cn } from '../../../design/cn';
import { ServiceMedallion } from '../../shared/service-medallion';
import { bodyHeightOf, fitChips, fitRows, rowCapacity, syncFaceOf } from './frame-faces';
import {
  FolderChip,
  FolderLink,
  InviteLine,
  MoreLink,
  PeerDots,
  PeerLink,
  Rates,
  StaleLine,
} from './sync-parts';
import { devicesLine, spokenStatus, type StaleCaption, type SyncStatus } from './sync-model';
import type { SyncReady } from './sync-widget-frame';

const HEADLINE_HEIGHT = 28;
const STALE_RESERVE = 22;
const WIDE_CHIP_SHARE = 0.6;
const WIDE_GUTTER = 24;
const CHIP_LINES_WIDE = 2;

export interface SyncFaceProps {
  readonly ready: SyncReady;
  readonly status: SyncStatus;
  readonly stale: StaleCaption | null;
  readonly folders: readonly SyncthingFolder[];
}

function Headline({
  status,
  size,
}: {
  readonly status: SyncStatus;
  readonly size: 'body-strong' | 'title-3';
}): ReactNode {
  return (
    <Text variant={size} tone={status.textTone} numberOfLines={1} className="shrink">
      {status.word}
    </Text>
  );
}

function Tile({ status, stale }: SyncFaceProps): ReactNode {
  return (
    <View className="flex-1 justify-end gap-1">
      <ServiceMedallion
        glyph="folderSync"
        tone={status.medallionTone}
        ratio={status.share}
        live={stale === null && status.live}
        size="widget"
        label={spokenStatus(status, stale)}
        offline={stale !== null}
      />
      <View className={cn('gap-0.5', stale !== null && 'opacity-60')}>
        <Headline status={status} size="body-strong" />
      </View>
      {stale === null ? (
        <Text variant="caption" tone="variant" numberOfLines={1}>
          {status.left}
        </Text>
      ) : (
        <StaleLine stale={stale} short />
      )}
    </View>
  );
}

function Chips({
  folders,
  width,
  lines,
}: {
  readonly folders: readonly SyncthingFolder[];
  readonly width: number;
  readonly lines: number;
}): ReactNode {
  const { shown, more } = fitChips(
    folders.map((folder) => ({ label: folder.label, folder })),
    width,
    lines,
  );
  return (
    <View className="flex-row flex-wrap items-center gap-1.5">
      {shown.map(({ folder }) => (
        <FolderChip key={folder.id} folder={folder} />
      ))}
      {more > 0 ? (
        <Text variant="caption" tone="variant">
          {`+${String(more)}`}
        </Text>
      ) : null}
    </View>
  );
}

function Compact({ ready, status, stale, folders }: SyncFaceProps): ReactNode {
  const { frame, cls } = useWidgetFace();
  return (
    <View className="gap-1.5">
      <View className={cn('gap-1.5', stale !== null && 'opacity-60')}>
        <View className="flex-row items-baseline gap-2">
          <Headline status={status} size="body-strong" />
          <Text variant="footnote" tone="variant" numberOfLines={1} className="shrink">
            {status.left}
          </Text>
        </View>
        <Chips folders={folders} width={frame.width} lines={1} />
        {cls === 'm' ? (
          <Text variant="footnote" tone="variant" numberOfLines={1}>
            {devicesLine(ready.snapshot.summary)}
          </Text>
        ) : null}
      </View>
      {stale === null ? null : <StaleLine stale={stale} />}
    </View>
  );
}

function FolderRows({
  folders,
  ready,
  capacity,
}: {
  readonly folders: readonly SyncthingFolder[];
  readonly ready: SyncReady;
  readonly capacity: number;
}): ReactNode {
  const { shown, more } = fitRows(folders, capacity);
  return (
    <>
      {shown.map((folder) => (
        <FolderLink key={folder.id} folder={folder} ready={ready} />
      ))}
      {more > 0 ? <MoreLink count={more} ready={ready} noun="folders" section="folders" /> : null}
    </>
  );
}

function Rows({ ready, status, stale, folders }: SyncFaceProps): ReactNode {
  const { frame, sizes } = useWidgetFace();
  const reserved = HEADLINE_HEIGHT + sizes.touchMin + (stale === null ? 0 : STALE_RESERVE);
  const capacity = rowCapacity(bodyHeightOf(frame), reserved, sizes.touchMin);
  return (
    <View className="flex-1 gap-1">
      <View className={cn('flex-row items-baseline gap-2', stale !== null && 'opacity-60')}>
        <Headline status={status} size="title-3" />
        <View className="flex-1" />
        {stale === null ? <Rates status={status} ready={ready} /> : null}
      </View>
      <View className={cn('flex-1', stale !== null && 'opacity-60')}>
        <FolderRows folders={folders} ready={ready} capacity={capacity} />
      </View>
      <View className="flex-row items-center justify-between gap-2">
        <InviteLine ready={ready} />
        <PeerDots ready={ready} />
      </View>
      {stale === null ? null : <StaleLine stale={stale} />}
    </View>
  );
}

function Wide({ ready, status, stale, folders }: SyncFaceProps): ReactNode {
  const { frame } = useWidgetFace();
  return (
    <View className="flex-1 flex-row items-center gap-6">
      <View className="w-2/5 gap-0.5">
        <View className={cn('gap-0.5', stale !== null && 'opacity-60')}>
          <Headline status={status} size="title-3" />
          <Rates status={status} ready={ready} />
        </View>
        {stale === null ? <InviteLine ready={ready} /> : <StaleLine stale={stale} />}
      </View>
      <View className={cn('min-w-0 flex-1', stale !== null && 'opacity-60')}>
        <Chips
          folders={folders}
          width={frame.width * WIDE_CHIP_SHARE - WIDE_GUTTER}
          lines={CHIP_LINES_WIDE}
        />
      </View>
    </View>
  );
}

function Columns({ ready, status, stale, folders }: SyncFaceProps): ReactNode {
  const { frame, sizes } = useWidgetFace();
  const reserved = 2 * HEADLINE_HEIGHT + (stale === null ? 0 : STALE_RESERVE);
  const capacity = rowCapacity(bodyHeightOf(frame), reserved, sizes.touchMin);
  const peers = fitRows(ready.snapshot.peers, capacity);
  return (
    <View className="flex-1 gap-1">
      <View className={cn('flex-row items-baseline gap-2', stale !== null && 'opacity-60')}>
        <Headline status={status} size="title-3" />
        <View className="flex-1" />
        {stale === null ? <Rates status={status} ready={ready} /> : null}
      </View>
      <View className={cn('flex-1 flex-row gap-6', stale !== null && 'opacity-60')}>
        <View className="min-w-0 flex-1">
          <Text variant="label" tone="variant">
            Folders
          </Text>
          <FolderRows folders={folders} ready={ready} capacity={capacity} />
        </View>
        <View className="min-w-0 flex-1">
          <Text variant="label" tone="variant">
            Devices
          </Text>
          {peers.shown.map((peer) => (
            <PeerLink key={peer.id} peer={peer} ready={ready} />
          ))}
          {peers.more > 0 ? (
            <MoreLink count={peers.more} ready={ready} noun="devices" section="devices" />
          ) : null}
          <InviteLine ready={ready} />
        </View>
      </View>
      {stale === null ? null : <StaleLine stale={stale} />}
    </View>
  );
}

export function SyncFace(props: SyncFaceProps): ReactNode {
  const { cls } = useWidgetFace();
  switch (syncFaceOf(cls)) {
    case 'tile':
      return <Tile {...props} />;
    case 'compact':
      return <Compact {...props} />;
    case 'rows':
      return <Rows {...props} />;
    case 'wide':
      return <Wide {...props} />;
    case 'columns':
      return <Columns {...props} />;
  }
}
