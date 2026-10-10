import {
  SIGHT_FACING,
  type AppSightSource,
  type SightFacing,
  type SightSource,
} from '@smarteverything/domain';
import { SightStartError } from '../sight-failure';
import { openCamera, openScreen, type CameraRequest, type OpenedSight } from './sight-devices';

export type Lane = 'camera' | 'screen';

export function laneOf(source: SightSource): Lane | null {
  switch (source) {
    case 'phone_camera':
      return 'camera';
    case 'desktop_screen':
    case 'desktop_window':
      return 'screen';
    case 'phone_screen':
    case 'home_camera':
      return null;
  }
}

export function facingOfTarget(target: string | null, fallback: SightFacing): SightFacing {
  const parsed = SIGHT_FACING.safeParse(target);
  return parsed.success ? parsed.data : fallback;
}

export function opening(source: AppSightSource, camera: CameraRequest): Promise<OpenedSight> {
  switch (source) {
    case 'phone_camera':
      return openCamera(camera);
    case 'desktop_screen':
    case 'desktop_window':
      return openScreen(source);
    case 'phone_screen':
      return Promise.reject(
        new SightStartError(source, 'unsupported', 'A browser cannot share a phone screen'),
      );
  }
}

export function nextCamera(opened: OpenedSight, devices: readonly string[]): CameraRequest {
  if (opened.facing === 'front' || opened.facing === 'back') {
    return { facing: opened.facing === 'front' ? 'back' : 'front', deviceId: null };
  }
  const current = opened.stream.getVideoTracks()[0]?.getSettings().deviceId;
  const at = current === undefined ? -1 : devices.indexOf(current);
  return { facing: 'external', deviceId: devices[(at + 1) % Math.max(1, devices.length)] ?? null };
}
