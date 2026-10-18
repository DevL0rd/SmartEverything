import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { CapabilityRole } from '@smarteverything/domain';
import type { FrameClass, WidgetFrameBox, WidgetSize } from '../../../components/widget-board';
import type { Device } from '../../../store/state';
import { useVisualPx } from '../../device-visuals';
import { ControlsArea } from './card-controls';
import { Corner, Facts, Header, Names, Trend } from './card-parts';
import { Visual } from './stage';

const MAX_CONTROLS: Readonly<Record<FrameClass, number>> = {
  s: 1,
  xs: 2,
  m: 2,
  w: 4,
  l: 6,
  xl: 8,
};

export interface GenericFaceProps {
  readonly device: Device;
  readonly box: WidgetFrameBox;
  readonly size: WidgetSize;
}

const NONE: ReadonlySet<CapabilityRole> = new Set();
const ROW_STAGE = 96;
const ROW_GAP = 16;
const ROW_HEADER = 64;
const TILE_CHROME = 116;
const STACK_CHROME = 176;
const STACK_HERO_CHROME = 80;
const SIDE_ROOM = 480;
const SIDE_CHROME = 200;

function room(
  box: WidgetFrameBox,
  taken: { readonly width?: number; readonly height: number },
): {
  readonly width: number;
  readonly height: number;
} {
  return {
    width: Math.max(0, box.width - (taken.width ?? 0)),
    height: Math.max(0, box.height - taken.height),
  };
}

function TileFace({ device, box }: GenericFaceProps): ReactNode {
  return (
    <View className="flex-1 gap-2" pointerEvents="box-none">
      <View className="flex-row items-start justify-between" pointerEvents="box-none">
        <Visual device={device} size="tile" />
        <Corner device={device} />
      </View>
      <Names device={device} look="tile" />
      <ControlsArea
        device={device}
        box={room(box, { height: TILE_CHROME })}
        max={MAX_CONTROLS.m}
        dense
        labels="caption"
      />
    </View>
  );
}

function RowFace({ device, box, size }: GenericFaceProps): ReactNode {
  return (
    <View className="flex-1 flex-row gap-4" pointerEvents="box-none">
      <View className="self-start">
        <Visual device={device} size="card" />
      </View>
      <View className="min-w-0 flex-1 gap-3" pointerEvents="box-none">
        <Header device={device} large={false} />
        <ControlsArea
          device={device}
          box={room(box, { width: ROW_STAGE + ROW_GAP, height: ROW_HEADER })}
          max={MAX_CONTROLS[size === 'W' ? 'w' : 'm']}
          dense
        />
      </View>
    </View>
  );
}

function StackFace({ device, box }: GenericFaceProps): ReactNode {
  return (
    <View className="flex-1 gap-3" pointerEvents="box-none">
      <Header device={device} large />
      <View className="flex-row items-start gap-3" pointerEvents="box-none">
        <Visual device={device} size="card" />
        <View className="min-w-0 flex-1 gap-2" pointerEvents="none">
          <Facts device={device} hidden={NONE} max={2} column={false} large={false} />
          <Trend device={device} />
        </View>
      </View>
      <ControlsArea
        device={device}
        box={room(box, { height: STACK_CHROME })}
        max={MAX_CONTROLS.l}
        dense={false}
      />
    </View>
  );
}

function StackHeroFace({ device, box }: GenericFaceProps): ReactNode {
  const hero = useVisualPx('hero');
  return (
    <View className="flex-1 gap-3" pointerEvents="box-none">
      <Header device={device} large />
      <View className="flex-row items-start gap-3" pointerEvents="box-none">
        <View className="min-w-0 flex-1 justify-between gap-2" pointerEvents="none">
          <Facts device={device} hidden={NONE} max={3} column large={false} />
          <Trend device={device} />
        </View>
        <Visual device={device} size="hero" />
      </View>
      <ControlsArea
        device={device}
        box={room(box, { height: hero + STACK_HERO_CHROME })}
        max={MAX_CONTROLS.l}
        dense={false}
      />
    </View>
  );
}

function SideFace({ device, box }: GenericFaceProps): ReactNode {
  const hero = useVisualPx('hero');
  return (
    <View className="flex-1 flex-row items-start gap-6" pointerEvents="box-none">
      <Visual device={device} size="hero" />
      <View className="min-w-0 flex-1 gap-4" pointerEvents="box-none">
        <Header device={device} large />
        <View className="flex-row items-end gap-6" pointerEvents="none">
          <Facts device={device} hidden={NONE} max={4} column={false} large />
          <View className="min-w-40 flex-1">
            <Trend device={device} />
          </View>
        </View>
        <ControlsArea
          device={device}
          box={room(box, { width: hero + 24, height: SIDE_CHROME })}
          max={MAX_CONTROLS.xl}
          dense={false}
        />
      </View>
    </View>
  );
}

function PanelFace(props: GenericFaceProps): ReactNode {
  const hero = useVisualPx('hero');
  const { box } = props;
  if (box.width >= hero + SIDE_ROOM && box.height >= hero) {
    return <SideFace {...props} />;
  }
  return box.height >= hero + STACK_CHROME ? (
    <StackHeroFace {...props} />
  ) : (
    <StackFace {...props} />
  );
}

export const GENERIC_FACES: Readonly<Record<FrameClass, (props: GenericFaceProps) => ReactNode>> = {
  s: TileFace,
  xs: RowFace,
  m: RowFace,
  w: RowFace,
  l: PanelFace,
  xl: PanelFace,
};
