import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Interactive } from '../../../components/interactive';
import type { Device } from '../../../store/state';
import { useDeviceContextMenu } from '../controls/device-context-menu';
import { usePowerAction } from '../controls/power-toggle';
import { LevelControl } from './level-control';
import { LightName } from './light-name';
import { LightDot } from './light-parts';
import { lightLabel, useLight, type LightView } from './use-light';

function ChipLabel({ light }: { readonly light: LightView }): ReactNode {
  return (
    <View className="min-w-0 flex-1 flex-row items-center gap-2 pl-1.5" pointerEvents="none">
      <LightDot light={light} className="size-5" />
      <LightName name={light.name} variant="callout" />
    </View>
  );
}

export function LightChip({ device }: { readonly device: Device }): ReactNode {
  const light = useLight(device);
  const power = usePowerAction(device);
  const menu = useDeviceContextMenu(device, { quickControls: true, label: light.name });
  const { brightness } = light.parts;
  return (
    <>
      <Interactive
        role="switch"
        checked={light.state.power === 'on'}
        label={lightLabel(light)}
        disabled={!light.state.online}
        onPress={power.toggle}
        onLongPress={menu.onLongPress}
        onContextMenu={menu.onContextMenu}
        className="min-h-touch-min min-w-24 max-w-45 justify-center rounded-full"
        layerClassName="rounded-full"
      >
        {brightness === null ? (
          <View className="h-8 flex-row items-center overflow-hidden rounded-full border-hairline border-outline-variant bg-surface-2">
            <ChipLabel light={light} />
          </View>
        ) : (
          <LevelControl
            device={device}
            presented={brightness}
            label={`${light.name} brightness`}
            shape="chip"
            showValue={false}
            adjustable={false}
            tint={light.colour ?? undefined}
          >
            <ChipLabel light={light} />
          </LevelControl>
        )}
      </Interactive>
      {menu.host}
    </>
  );
}
