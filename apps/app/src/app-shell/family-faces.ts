import { createElement, type ReactNode } from 'react';
import type { DeviceFamily } from '@smarteverything/domain';
import type { FrameClass } from '../components/widget-board';
import { ComputerFace } from '../features/computers/card/computer-faces';
import { PhoneFace } from '../features/phone/card/phone-face';
import type { Device } from '../store/state';

const COMPACT: ReadonlySet<FrameClass> = new Set(['s', 'xs']);

export function renderFamilyFace(
  family: DeviceFamily,
  device: Device,
  cls: FrameClass,
): ReactNode | null {
  if (family === 'computer') return createElement(ComputerFace, { device, cls });
  if (family === 'phone' && !COMPACT.has(cls)) return createElement(PhoneFace, { device, cls });
  return null;
}
