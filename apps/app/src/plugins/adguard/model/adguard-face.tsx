import type { ReactNode } from 'react';
import { View } from 'react-native';
import { frameClassOf, type WidgetFrameBox } from '../../../components/widget-board';
import { isWideClass } from '../../../features/devices';
import type { Device } from '../../../store/state';
import { ServiceMedallion } from '../../shared/service-medallion';
import { ServiceNames } from '../../shared/service-names';
import { useAdGuardSnapshot } from '../adguard-data';
import { AdGuardCellFace } from './adguard-cell';
import { heroOf, type HeroModel } from './hero-model';

function FaceMedallion({ hero }: { readonly hero: HeroModel | null }): ReactNode {
  return (
    <ServiceMedallion
      glyph="shield"
      tone={hero?.tone ?? 'neutral'}
      ratio={hero?.ratio ?? null}
      live={false}
      size="widget"
      label={hero?.spoken ?? 'AdGuard Home'}
      offline={hero?.stale ?? true}
    />
  );
}

export function AdGuardFace({
  device,
  size,
  showRoom,
}: {
  readonly device: Device;
  readonly size: string;
  readonly showRoom: boolean;
}): ReactNode {
  const stream = useAdGuardSnapshot();
  const hero = stream.state === 'ready' ? heroOf(stream.value) : null;
  const line = hero === null ? 'Waiting for AdGuard Home' : hero.line;
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

export function AdGuardCardFace({
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
    <AdGuardCellFace device={device} cls={cls} />
  ) : (
    <AdGuardFace device={device} size={size} showRoom />
  );
}
