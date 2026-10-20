import type { OralbRingName } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { useColour } from '../../../design/colour';
import { useControl } from '../../../store/control';
import { Anchored } from '../../toothbrush/settings/anchored';
import { tintStyle } from '../../toothbrush/charts/style';
import { borderColorStyle } from '../charts/style';
import { RING_NAME, ringText, type OralbHandle } from '../model/care-model';
import { ringSwatches, type Gate } from '../model/settings-model';

function Swatch({
  name,
  hex,
  current,
  gate,
  onPick,
}: {
  readonly name: OralbRingName;
  readonly hex: string;
  readonly current: boolean;
  readonly gate: Gate;
  readonly onPick: () => void;
}): ReactNode {
  const edge = useColour('on-surface');
  const label = `${RING_NAME[name]}${current ? ', current colour' : ''}`;
  const dot = (
    <View
      className="size-10 items-center justify-center rounded-full border-2"
      style={borderColorStyle(current ? edge : 'transparent')}
    >
      <View className="size-7 rounded-full border border-outline" style={tintStyle(hex, 1)} />
    </View>
  );
  const frame = 'min-h-touch-min min-w-10 flex-1 items-center justify-center';
  if (!gate.open) {
    return (
      <View
        accessible
        accessibilityRole="radio"
        accessibilityLabel={label}
        accessibilityState={{ selected: current, disabled: true }}
        className={frame}
      >
        {dot}
      </View>
    );
  }
  return (
    <Interactive role="radio" label={label} selected={current} onPress={onPick} className={frame}>
      {dot}
    </Interactive>
  );
}

export function RingChoice({
  deviceId,
  gate,
  handle,
}: {
  readonly deviceId: string;
  readonly gate: Gate;
  readonly handle: OralbHandle;
}): ReactNode {
  const control = useControl(deviceId, 'brush_ring_colour');
  const swatches = ringSwatches();
  return (
    <Anchored deviceId={deviceId} id="oralb-ring" label="SmartRing colour">
      <View className="gap-2 px-4 py-2">
        <View className="flex-row items-baseline justify-between">
          <Text variant="body">SmartRing colour</Text>
          <Text variant="callout" tone="variant">
            {ringText(handle)}
          </Text>
        </View>
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel="SmartRing colour"
          className="flex-row gap-1"
        >
          {swatches.map((swatch) => (
            <Swatch
              key={swatch.name}
              name={swatch.name}
              hex={swatch.hex}
              current={handle.ringColour === swatch.name}
              gate={gate}
              onPick={() => {
                background(control.set(swatch.name), 'control.set_failed');
              }}
            />
          ))}
        </View>
      </View>
    </Anchored>
  );
}
