import type { ReactNode } from 'react';
import type { DeviceFamily } from '@smarteverything/domain';
import type { Device } from '../../../store/state';
import type { FaceProps } from './face-types';
import { LightFaceOf } from './light-face';

export type FamilyFace = (
  props: Omit<FaceProps, 'deviceId'> & { readonly device: Device },
) => ReactNode;

export const FAMILY_FACES: Readonly<Partial<Record<DeviceFamily, FamilyFace>>> = {
  light: LightFaceOf,
};
