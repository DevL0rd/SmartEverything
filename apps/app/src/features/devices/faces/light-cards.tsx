import type { ReactNode } from 'react';
import { View } from 'react-native';
import { LevelLabel, type LevelShape } from '../../../components/level-surface';
import { StatusChip } from '../../../components/status-chip';
import type { Device } from '../../../store/state';
import { Visual } from '../card/stage';
import { ColourSheetDot } from '../controls/colour-shortcut';
import { PowerToggle } from '../controls/power-toggle';
import { LevelControl } from './level-control';
import { LightColourStrip } from './light-colour-strip';
import { LightNames, OfflineReason } from './light-parts';
import { useLight, type LightView } from './use-light';
import { WhiteControl } from './white-control';

const BRIGHTNESS = 'Brightness';

function Power({ light }: { readonly light: LightView }): ReactNode {
  return light.state.online ? (
    <PowerToggle device={light.device} />
  ) : (
    <StatusChip status="offline" />
  );
}

function TileCorner({ light }: { readonly light: LightView }): ReactNode {
  if (!light.state.online) {
    return <StatusChip status="offline" />;
  }
  return (
    <>
      <ColourSheetDot device={light.device} colour={light.colour} />
      <PowerToggle device={light.device} />
    </>
  );
}

export function Dimmer({
  light,
  shape,
  className,
}: {
  readonly light: LightView;
  readonly shape: LevelShape;
  readonly className?: string;
}): ReactNode {
  const { brightness } = light.parts;
  if (brightness === null || !light.state.online) {
    return null;
  }
  return (
    <LevelControl
      device={light.device}
      presented={brightness}
      label={`${light.name} brightness`}
      shape={shape}
      tint={light.colour ?? undefined}
      {...(className === undefined ? {} : { className })}
    >
      {shape === 'slim' ? null : <LevelLabel>{BRIGHTNESS}</LevelLabel>}
    </LevelControl>
  );
}

function White({ light }: { readonly light: LightView }): ReactNode {
  const { temperature } = light.parts;
  if (temperature === null || !light.state.online) {
    return null;
  }
  return <WhiteControl light={light} presented={temperature} />;
}

export function LightTile({ device }: { readonly device: Device }): ReactNode {
  const light = useLight(device);
  return (
    <>
      <View className="flex-1 flex-row items-center gap-2" pointerEvents="box-none">
        <Visual device={device} size="tile" />
        <LightNames light={light} lines={1} short />
        <TileCorner light={light} />
      </View>
      <Dimmer light={light} shape="slim" className="mt-2" />
    </>
  );
}

export function LightCard({ device }: { readonly device: Device }): ReactNode {
  const light = useLight(device);
  return (
    <View className="flex-1 justify-between gap-1" pointerEvents="box-none">
      <View className="flex-row items-center gap-3" pointerEvents="box-none">
        <Visual device={device} size="tile" />
        <LightNames light={light} lines={1} short />
        <Power light={light} />
      </View>
      <Dimmer light={light} shape="bar" className="h-10" />
      <LightColourStrip light={light} density="compact" />
    </View>
  );
}

function Spare({ device }: { readonly device: Device }): ReactNode {
  return (
    <View
      className="min-h-0 flex-1 items-center justify-center overflow-hidden"
      pointerEvents="none"
    >
      <Visual device={device} size="hero" />
    </View>
  );
}

export function LightPanel({ device }: { readonly device: Device }): ReactNode {
  const light = useLight(device);
  const { colour, temperature } = light.parts;
  const spare = !light.state.online || (colour === null && temperature === null);
  return (
    <View className="flex-1 gap-2" pointerEvents="box-none">
      <View className="flex-row items-center gap-3" pointerEvents="box-none">
        <Visual device={device} size="card" />
        <LightNames light={light} lines={2} />
        <Power light={light} />
      </View>
      {light.state.online ? null : <OfflineReason />}
      {spare ? <Spare device={device} /> : <View className="flex-1" />}
      <Dimmer light={light} shape="bar" />
      <White light={light} />
      <LightColourStrip light={light} density="full" />
    </View>
  );
}

export function LightWide({ device }: { readonly device: Device }): ReactNode {
  const light = useLight(device);
  return (
    <View className="flex-1 flex-row items-center gap-4" pointerEvents="box-none">
      <Visual device={device} size="tile" />
      <View className="w-1/4 shrink-0" pointerEvents="none">
        <LightNames light={light} lines={2} />
        {light.state.online ? null : <OfflineReason />}
      </View>
      <View className="min-w-0 flex-1 gap-2" pointerEvents="box-none">
        <Dimmer light={light} shape="bar" />
        <View className="flex-row items-center gap-3" pointerEvents="box-none">
          <View className="min-w-40 flex-3">
            <White light={light} />
          </View>
          <View className="min-w-0 flex-2">
            <LightColourStrip light={light} density="compact" />
          </View>
        </View>
      </View>
      <Power light={light} />
    </View>
  );
}

export function LightHeroCard({ device }: { readonly device: Device }): ReactNode {
  const light = useLight(device);
  return (
    <View className="flex-1 flex-row items-center gap-6" pointerEvents="box-none">
      <View className="w-1/4 shrink-0 gap-3" pointerEvents="none">
        <Visual device={device} size="card" />
        <LightNames light={light} lines={2} />
        {light.state.online ? null : <OfflineReason />}
      </View>
      <View className="min-w-0 flex-1 justify-center gap-3" pointerEvents="box-none">
        <Dimmer light={light} shape="bar" />
        <White light={light} />
        <LightColourStrip light={light} density="full" />
      </View>
      <Power light={light} />
    </View>
  );
}
