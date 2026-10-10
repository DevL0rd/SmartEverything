import type { XiaomiRegion } from './cloud-signing';
import { hasMotor, ptzPlan } from './ptz';
import { standardName, type MiotSpec } from './spec';

const CAMERA_MODEL = /\.(camera|cateye|feeder)\./;

export interface Go2rtcCamera {
  readonly userId: string;
  readonly region: XiaomiRegion;
  readonly ip: string;
  readonly did: string;
  readonly model: string;
}

export interface CameraFeatures {
  readonly twoWayAudio: boolean;
  readonly physicalPtz: boolean;
  readonly doorbell: boolean;
}

export function isCameraModel(model: string): boolean {
  return CAMERA_MODEL.test(model);
}

export function go2rtcSource(camera: Go2rtcCamera): string {
  const query = new URLSearchParams({ did: camera.did, model: camera.model });
  return `xiaomi://${encodeURIComponent(camera.userId)}:${camera.region}@${camera.ip}?${query.toString()}`;
}

export function cameraFeatures(spec: MiotSpec, model: string): CameraFeatures {
  const services = spec.services.map((service) => standardName(service.type));
  const device = standardName(spec.type);
  return {
    twoWayAudio: services.includes('speaker'),
    physicalPtz: hasMotor(ptzPlan(spec, model)),
    doorbell: device === 'video-doorbell' || device === 'doorbell' || services.includes('key-call'),
  };
}
