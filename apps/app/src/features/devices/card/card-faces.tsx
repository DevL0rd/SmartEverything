import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { CapabilityRole } from '@smarteverything/domain';
import type { FrameClass } from '../../../components/widget-board';
import { ActionBand } from '../../../components/widget-board/action-band';
import { cn } from '../../../design/cn';
import type { Device } from '../../../store/state';
import { DeviceBandItems } from '../faces/band-actions';
import { useSlot } from '../faces/use-slot';
import { columnCount } from '../model/control-columns';
import { ControlsArea } from './card-controls';
import { Facts, Header, Names, OfflineChip, Trend } from './card-parts';
import { Visual } from './stage';
import { WIDE_VISUAL_PX, WideArt, type WideClass } from './wide-card';

export interface GenericFaceProps {
  readonly device: Device;
  readonly cls: FrameClass;
}

const NONE: ReadonlySet<CapabilityRole> = new Set();
const FACT_WIDTH = 96;
const FACT_GAP = 8;

function Lower({
  device,
  beside,
  dense,
  caption = false,
}: {
  readonly device: Device;
  readonly beside: boolean;
  readonly dense: boolean;
  readonly caption?: boolean;
}): ReactNode {
  const { slot, onLayout } = useSlot();
  return (
    <View
      className={cn('min-h-0 flex-1', beside ? 'flex-row items-end gap-2' : 'gap-3')}
      pointerEvents="box-none"
    >
      <ControlsArea
        device={device}
        box={slot}
        dense={dense}
        onLayout={onLayout}
        {...(caption ? { labels: 'caption' as const } : {})}
      />
      <View className={cn(beside && 'min-w-0 shrink')} pointerEvents="box-none">
        <ActionBand>
          <DeviceBandItems device={device} />
        </ActionBand>
      </View>
    </View>
  );
}

function Art({ device, cls }: { readonly device: Device; readonly cls: WideClass }): ReactNode {
  return (
    <WideArt cls={cls}>
      <Visual device={device} size="card" px={WIDE_VISUAL_PX[cls]} />
    </WideArt>
  );
}

function TileFace({ device }: { readonly device: Device }): ReactNode {
  return (
    <View className="flex-1 gap-2" pointerEvents="box-none">
      <View className="flex-row items-start justify-between" pointerEvents="none">
        <Visual device={device} size="tile" />
        <OfflineChip device={device} />
      </View>
      <Names device={device} look="tile" />
      <Lower device={device} beside dense caption />
    </View>
  );
}

function RowFace({ device, cls }: { readonly device: Device; readonly cls: WideClass }): ReactNode {
  return (
    <View
      className={cn('flex-1 flex-row', cls === 'm' ? 'gap-3' : 'gap-4')}
      pointerEvents="box-none"
    >
      <Art device={device} cls={cls} />
      <View className="min-w-0 flex-1 gap-1.5" pointerEvents="box-none">
        <Header device={device} large={false} />
        <Lower device={device} beside dense />
      </View>
    </View>
  );
}

function FactsRow({
  device,
  wide,
}: {
  readonly device: Device;
  readonly wide: boolean;
}): ReactNode {
  const { slot, onLayout } = useSlot();
  return (
    <View className={cn('min-w-0', wide && 'flex-1')} onLayout={onLayout} pointerEvents="none">
      {slot.width === 0 ? null : (
        <Facts
          device={device}
          hidden={NONE}
          max={columnCount(slot.width, FACT_WIDTH, FACT_GAP)}
          column={false}
          large={false}
        />
      )}
    </View>
  );
}

function Details({ device, wide }: { readonly device: Device; readonly wide: boolean }): ReactNode {
  return (
    <View className={cn(wide ? 'flex-row items-end gap-6' : 'gap-2')} pointerEvents="none">
      <FactsRow device={device} wide={wide} />
      <View className={cn(wide && 'min-w-40 flex-1')}>
        <Trend device={device} />
      </View>
    </View>
  );
}

function PanelFace({
  device,
  cls,
}: {
  readonly device: Device;
  readonly cls: WideClass;
}): ReactNode {
  return (
    <View className="flex-1 flex-row gap-4" pointerEvents="box-none">
      <Art device={device} cls={cls} />
      <View className="min-w-0 flex-1 gap-3" pointerEvents="box-none">
        <Header device={device} large />
        <Details device={device} wide={cls === 'xl'} />
        <Lower device={device} beside={false} dense={false} />
      </View>
    </View>
  );
}

export function GenericFace({ device, cls }: GenericFaceProps): ReactNode {
  switch (cls) {
    case 's':
      return <TileFace device={device} />;
    case 'xs':
    case 'm':
      return <RowFace device={device} cls="m" />;
    case 'w':
      return <RowFace device={device} cls="w" />;
    case 'l':
    case 'xl':
      return <PanelFace device={device} cls={cls} />;
  }
}
