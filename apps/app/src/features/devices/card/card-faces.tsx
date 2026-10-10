import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { CapabilityRole } from '@smarteverything/domain';
import type { WidgetSize } from '../../../components/widget-board';
import type { Device } from '../../../store/state';
import type { VisualSize } from '../../device-visuals';
import { ControlsArea } from './card-controls';
import { Corner, Facts, Header, Names, Trend } from './card-parts';
import { LevelDrag } from './level-drag';
import { Visual } from './stage';

export type Layout = 'line' | 'tile' | 'banner' | 'row' | 'stack' | 'stack-hero' | 'side';

const MAX_CONTROLS: Readonly<Record<WidgetSize, number>> = {
  S: 1,
  M: 2,
  W: 4,
  L: 6,
  XL: 8,
};

export interface Box {
  readonly width: number;
  readonly height: number;
}

export interface FaceProps {
  readonly device: Device;
  readonly hidden: ReadonlySet<CapabilityRole>;
  readonly size: WidgetSize;
  readonly open: () => void;
  readonly box: Box;
}

const SIDE_ROOM = 480;
const HEADER_ROOM = 72;
const CONTROLS_ROOM = 170;
const SIDE_CHROME = 200;
const LINE_ROOM = 112;

export function layoutOf(size: WidgetSize, box: Box, hero: number): Layout {
  if (size === 'S') {
    return box.height < LINE_ROOM ? 'line' : 'tile';
  }
  if (size === 'M' || size === 'W') {
    return 'row';
  }
  if (box.width >= hero + SIDE_ROOM && box.height >= hero) {
    return 'side';
  }
  return box.height >= hero + HEADER_ROOM + CONTROLS_ROOM ? 'stack-hero' : 'stack';
}

function Stage({
  device,
  open,
  size,
}: Pick<FaceProps, 'device' | 'open'> & { readonly size: VisualSize }): ReactNode {
  return (
    <LevelDrag device={device} onTap={open}>
      <Visual device={device} size={size} />
    </LevelDrag>
  );
}

function LineFace({ device, open }: FaceProps): ReactNode {
  return (
    <View className="flex-1 flex-row items-center gap-3" pointerEvents="box-none">
      <Stage device={device} open={open} size="tile" />
      <View className="min-w-0 flex-1" pointerEvents="none">
        <Names device={device} look="line" />
      </View>
      {device.online ? <Corner device={device} /> : null}
    </View>
  );
}

function BannerFace({ device, open, size }: FaceProps): ReactNode {
  return (
    <View className="flex-1 gap-3" pointerEvents="box-none">
      <View className="flex-row items-start gap-3" pointerEvents="box-none">
        <Stage device={device} open={open} size="tile" />
        <View className="min-w-0 flex-1" pointerEvents="none">
          <Names device={device} look="card" />
        </View>
        <Corner device={device} />
      </View>
      <ControlsArea device={device} max={MAX_CONTROLS[size]} dense />
    </View>
  );
}

function TileFace({ device, open, size }: FaceProps): ReactNode {
  return (
    <View className="flex-1 gap-2" pointerEvents="box-none">
      <View className="flex-row items-start justify-between" pointerEvents="box-none">
        <Stage device={device} open={open} size="tile" />
        <Corner device={device} />
      </View>
      <Names device={device} look="tile" />
      <ControlsArea device={device} max={MAX_CONTROLS[size]} dense labels="caption" />
    </View>
  );
}

function RowFace({ device, open, size }: FaceProps): ReactNode {
  return (
    <View className="flex-1 flex-row gap-4" pointerEvents="box-none">
      <View className="self-start">
        <Stage device={device} open={open} size="card" />
      </View>
      <View className="min-w-0 flex-1 gap-3" pointerEvents="box-none">
        <Header device={device} large={false} />
        <ControlsArea device={device} max={MAX_CONTROLS[size]} dense />
      </View>
    </View>
  );
}

function StackFace({ device, hidden, open, size }: FaceProps): ReactNode {
  return (
    <View className="flex-1 gap-3" pointerEvents="box-none">
      <Header device={device} large />
      <View className="flex-row items-start gap-3" pointerEvents="box-none">
        <Stage device={device} open={open} size="card" />
        <View className="min-w-0 flex-1 gap-2" pointerEvents="none">
          <Facts device={device} hidden={hidden} max={2} column={false} large={false} />
          <Trend device={device} />
        </View>
      </View>
      <ControlsArea device={device} max={MAX_CONTROLS[size]} dense={false} />
    </View>
  );
}

function StackHeroFace({ device, hidden, open, size }: FaceProps): ReactNode {
  return (
    <View className="flex-1 gap-3" pointerEvents="box-none">
      <Header device={device} large />
      <View className="flex-row items-start gap-3" pointerEvents="box-none">
        <View className="min-w-0 flex-1 justify-between gap-2" pointerEvents="none">
          <Facts device={device} hidden={hidden} max={3} column large={false} />
          <Trend device={device} />
        </View>
        <Stage device={device} open={open} size="hero" />
      </View>
      <ControlsArea device={device} max={MAX_CONTROLS[size]} dense={false} />
    </View>
  );
}

function SideFace({ device, hidden, open, size, box }: FaceProps): ReactNode {
  return (
    <View className="flex-1 flex-row items-start gap-6" pointerEvents="box-none">
      <Stage device={device} open={open} size="hero" />
      <View className="min-w-0 flex-1 gap-4" pointerEvents="box-none">
        <Header device={device} large />
        <View className="flex-row items-end gap-6" pointerEvents="none">
          <Facts device={device} hidden={hidden} max={4} column={false} large />
          <View className="min-w-40 flex-1">
            <Trend device={device} />
          </View>
        </View>
        <ControlsArea
          device={device}
          max={MAX_CONTROLS[size]}
          dense={false}
          height={box.height - SIDE_CHROME}
        />
      </View>
    </View>
  );
}

export const FACES: Readonly<Record<Layout, (props: FaceProps) => ReactNode>> = {
  line: LineFace,
  tile: TileFace,
  banner: BannerFace,
  row: RowFace,
  stack: StackFace,
  'stack-hero': StackHeroFace,
  side: SideFace,
};
