import type { ReactNode } from 'react';
import { View } from 'react-native';
import { LevelLabel, type LevelShape } from '../../../components/level-surface';
import { StatusChip } from '../../../components/status-chip';
import { ActionBand } from '../../../components/widget-board/action-band';
import { cn } from '../../../design/cn';
import type { Device } from '../../../store/state';
import { Visual } from '../card/stage';
import { WIDE_VISUAL_PX, WideArt, type WideClass } from '../card/wide-card';
import { ColourSheetDot } from '../controls/colour-shortcut';
import { PowerToggle } from '../controls/power-toggle';
import { LevelControl } from './level-control';
import { LightColourStrip } from './light-colour-strip';
import { LightNames, OfflineReason } from './light-parts';
import { useLight, type LightView } from './use-light';
import { WhiteControl } from './white-control';

const BRIGHTNESS = 'Brightness';
const CONTROL_HEIGHT = 'h-control-h';

export function Dimmer({
  light,
  shape,
}: {
  readonly light: LightView;
  readonly shape: LevelShape;
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
      {...(shape === 'bar' ? { className: CONTROL_HEIGHT } : {})}
    >
      {shape === 'slim' ? null : <LevelLabel>{BRIGHTNESS}</LevelLabel>}
    </LevelControl>
  );
}

function White({
  light,
  compact,
}: {
  readonly light: LightView;
  readonly compact?: boolean;
}): ReactNode {
  const { temperature } = light.parts;
  if (temperature === null || !light.state.online) {
    return null;
  }
  return (
    <WhiteControl
      light={light}
      presented={temperature}
      compact={compact}
      className={CONTROL_HEIGHT}
    />
  );
}

function Head({
  light,
  lines,
  short = false,
}: {
  readonly light: LightView;
  readonly lines: number;
  readonly short?: boolean;
}): ReactNode {
  return (
    <View className="min-w-0 flex-row items-start gap-2" pointerEvents="none">
      <View className="min-w-0 flex-1">
        <LightNames light={light} lines={lines} short={short} />
      </View>
      {light.state.online ? null : <StatusChip status="offline" />}
    </View>
  );
}

function stripShown(light: LightView): boolean {
  const { colour, temperature } = light.parts;
  return light.state.online && (colour !== null || temperature !== null);
}

function Band({
  light,
  dot = false,
  strip = false,
}: {
  readonly light: LightView;
  readonly dot?: boolean;
  readonly strip?: boolean;
}): ReactNode {
  const { online } = light.state;
  return (
    <ActionBand>
      {strip && stripShown(light) ? (
        <Grow key="strip">
          <LightColourStrip light={light} density="compact" />
        </Grow>
      ) : null}
      {dot && online ? (
        <ColourSheetDot key="colour" device={light.device} colour={light.colour} />
      ) : null}
      {online ? <PowerToggle key="power" device={light.device} /> : null}
    </ActionBand>
  );
}

function Grow({ children }: { readonly children: ReactNode }): ReactNode {
  return (
    <View className="min-w-0 flex-1" pointerEvents="box-none">
      {children}
    </View>
  );
}

function Shell({
  light,
  cls,
  children,
}: {
  readonly light: LightView;
  readonly cls: WideClass;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <View
      className={cn('flex-1 flex-row', cls === 'm' ? 'gap-3' : 'gap-4')}
      pointerEvents="box-none"
    >
      <WideArt cls={cls}>
        <Visual device={light.device} size="card" px={WIDE_VISUAL_PX[cls]} />
      </WideArt>
      <View
        className={cn('min-w-0 flex-1', cls === 'm' ? 'gap-1.5' : 'gap-2')}
        pointerEvents="box-none"
      >
        {children}
      </View>
    </View>
  );
}

export function LightTile({ device }: { readonly device: Device }): ReactNode {
  const light = useLight(device);
  const dimmable = light.state.online && light.parts.brightness !== null;
  return (
    <View className="flex-1 gap-2" pointerEvents="box-none">
      <View className="flex-row items-center gap-2" pointerEvents="box-none">
        <Visual device={device} size="tile" />
        <Grow>
          <Head light={light} lines={1} short />
        </Grow>
      </View>
      <View className="mt-auto flex-row items-center gap-2" pointerEvents="box-none">
        {dimmable ? (
          <Grow>
            <Dimmer light={light} shape="slim" />
          </Grow>
        ) : null}
        <Band light={light} dot />
      </View>
    </View>
  );
}

export function LightCard({ device }: { readonly device: Device }): ReactNode {
  const light = useLight(device);
  return (
    <Shell light={light} cls="m">
      <Head light={light} lines={1} short />
      <Dimmer light={light} shape="bar" />
      <Band light={light} strip />
    </Shell>
  );
}

function Stacked({ light }: { readonly light: LightView }): ReactNode {
  return (
    <View className="gap-2" pointerEvents="box-none">
      <Dimmer light={light} shape="bar" />
      <White light={light} />
      <LightColourStrip light={light} density="full" />
    </View>
  );
}

export function LightPanel({ device }: { readonly device: Device }): ReactNode {
  const light = useLight(device);
  return (
    <Shell light={light} cls="l">
      <Head light={light} lines={2} />
      {light.state.online ? null : <OfflineReason />}
      <Stacked light={light} />
      <Band light={light} />
    </Shell>
  );
}

function Sliders({ light }: { readonly light: LightView }): ReactNode {
  const { brightness, temperature } = light.parts;
  if (!light.state.online || (brightness === null && temperature === null)) {
    return null;
  }
  return (
    <View className="flex-row items-center gap-3" pointerEvents="box-none">
      {brightness === null ? null : (
        <Grow>
          <Dimmer light={light} shape="bar" />
        </Grow>
      )}
      {temperature === null ? null : (
        <Grow>
          <White light={light} compact />
        </Grow>
      )}
    </View>
  );
}

export function LightWide({ device }: { readonly device: Device }): ReactNode {
  const light = useLight(device);
  return (
    <Shell light={light} cls="w">
      <Head light={light} lines={1} />
      {light.state.online ? null : <OfflineReason />}
      <Sliders light={light} />
      <Band light={light} strip />
    </Shell>
  );
}

export function LightHeroCard({ device }: { readonly device: Device }): ReactNode {
  const light = useLight(device);
  return (
    <Shell light={light} cls="xl">
      <View className="flex-row items-start gap-6" pointerEvents="box-none">
        <View className="min-w-0 flex-1 gap-2" pointerEvents="none">
          <Head light={light} lines={2} />
          {light.state.online ? null : <OfflineReason />}
        </View>
        <View className="min-w-0 flex-2" pointerEvents="box-none">
          <Stacked light={light} />
        </View>
      </View>
      <Band light={light} />
    </Shell>
  );
}
