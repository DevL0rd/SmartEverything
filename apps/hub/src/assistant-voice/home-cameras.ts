import { isPrivate, privacySwitchOf } from '@smarteverything/domain';
import type { Store } from '../store/store';
import type { CameraVideo } from '../talk/camera-video';
import { SightError } from './sight-error';
import type { VideoFrame } from './video';

export interface HomeCameras {
  readonly name: (cameraId: string) => string;
  readonly watch: (cameraId: string, listener: (frame: VideoFrame) => void) => () => void;
}

export interface HomeCamerasOptions {
  readonly store: Pick<Store, 'devices' | 'cameras' | 'state'>;
  readonly video: Pick<CameraVideo, 'watch'>;
}

export function homeCameras(options: HomeCamerasOptions): HomeCameras {
  const { store, video } = options;
  return {
    name: (cameraId): string => {
      const device = store.devices.find(cameraId);
      if (store.cameras.find(cameraId) === undefined || device === undefined) {
        throw new SightError('failed', `There is no camera ${cameraId} in this home.`);
      }
      if (!device.online) {
        throw new SightError('failed', `${device.name} is offline.`);
      }
      const privacy = privacySwitchOf(device);
      if (privacy !== null && isPrivate(privacy, store.state.value(device.id, privacy.key))) {
        throw new SightError('denied', `${device.name} has its privacy mode on.`);
      }
      return device.name;
    },
    watch: (cameraId, listener) => video.watch(cameraId, listener),
  };
}
