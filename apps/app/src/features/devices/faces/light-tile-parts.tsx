import type { ReactNode } from 'react';
import type { Device } from '../../../store/state';
import { ColourShortcut } from '../controls/colour-shortcut';
import { Dimmer } from './light-cards';
import { useLight } from './use-light';

export function LightTileBar({ device }: { readonly device: Device }): ReactNode {
  return <Dimmer light={useLight(device)} shape="slim" />;
}

export function LightTileCorner({ device }: { readonly device: Device }): ReactNode {
  return <ColourShortcut device={device} />;
}
