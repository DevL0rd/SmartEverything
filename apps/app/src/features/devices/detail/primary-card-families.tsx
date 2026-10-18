import type { ComponentType } from 'react';
import type { DeviceFamily } from '@smarteverything/domain';
import type { Device } from '../../../store/state';
import type { DeviceModel } from '../model/device-model';
import { colourAccessOf, lightPartsOf } from '../model/light-state';
import { LightControls } from './light-controls';

interface PrimaryCardFamily {
  readonly controls: ComponentType<{ readonly device: Device }>;
  readonly present: (model: DeviceModel) => boolean;
}

export const FAMILY_PRIMARY_CARDS: Readonly<Partial<Record<DeviceFamily, PrimaryCardFamily>>> = {
  light: {
    controls: LightControls,
    present: (model) => colourAccessOf(lightPartsOf(model)) !== null,
  },
};
