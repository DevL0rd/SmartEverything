import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { Device } from '../../../store/state';
import { LightColourStrip } from '../faces/light-colour-strip';
import { useLight } from '../faces/use-light';
import { WhiteControl } from '../faces/white-control';

export function LightControls({ device }: { readonly device: Device }): ReactNode {
  const light = useLight(device);
  const { temperature } = light.parts;
  return (
    <View className="gap-5">
      {temperature === null ? null : <WhiteControl light={light} presented={temperature} />}
      <LightColourStrip light={light} density="full" />
    </View>
  );
}
