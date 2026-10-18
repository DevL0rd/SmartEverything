import type { ReactNode } from 'react';
import { View } from 'react-native';
import { frameClassOf, type WidgetFrameBox } from '../../../components/widget-board';
import { isWideClass } from '../../../features/devices';
import type { Device } from '../../../store/state';
import { ServiceMedallion } from '../../shared/service-medallion';
import { ServiceNames } from '../../shared/service-names';
import { useSyncthingSnapshot } from '../syncthing-data';
import { heroOf, tileLine, type SyncHero } from './hero-model';
import { SyncCellFace } from './sync-cell';

const WAITING: SyncHero = {
  stale: true,
  tone: 'neutral',
  title: 'Syncthing',
  figures: undefined,
  ratio: null,
  ringNote: undefined,
  facts: [],
  spoken: 'Syncthing',
  live: false,
  canAct: false,
};

function FaceMedallion({ hero }: { readonly hero: SyncHero }): ReactNode {
  return (
    <ServiceMedallion
      glyph="folderSync"
      tone={hero.tone}
      ratio={hero.ratio}
      live={hero.live}
      size="widget"
      label={hero.spoken}
      offline={hero.stale}
    />
  );
}

export function SyncFace({
  device,
  size,
  showRoom,
}: {
  readonly device: Device;
  readonly size: string;
  readonly showRoom: boolean;
}): ReactNode {
  const stream = useSyncthingSnapshot();
  const ready = stream.state === 'ready' ? stream.value : null;
  const hero = ready === null ? WAITING : heroOf(ready);
  const line = ready === null ? 'Waiting for Syncthing' : tileLine(ready);
  const compact = size === 'tile';
  const names = (
    <ServiceNames device={device} line={line} showRoom={showRoom} lines={compact ? 2 : 1} />
  );
  if (compact) {
    return (
      <View className="flex-1 justify-between gap-2" pointerEvents="none">
        <FaceMedallion hero={hero} />
        {names}
      </View>
    );
  }
  return (
    <View className="flex-1 flex-row items-center gap-3" pointerEvents="none">
      <FaceMedallion hero={hero} />
      <View className="min-w-0 flex-1">{names}</View>
    </View>
  );
}

export function SyncCardFace({
  device,
  frame,
  size,
}: {
  readonly device: Device;
  readonly frame: WidgetFrameBox;
  readonly size: string;
}): ReactNode {
  const cls = frameClassOf(frame);
  return isWideClass(cls) ? (
    <SyncCellFace device={device} cls={cls} />
  ) : (
    <SyncFace device={device} size={size} showRoom />
  );
}
