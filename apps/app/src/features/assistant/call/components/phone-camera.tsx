import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { CameraView } from 'expo-camera';
import { Logger } from '@smarteverything/logging';
import { rawErrorText } from '../../../../format/errors';
import { cameraSurfaces, pictureSizeOf, type CameraSurface } from '../engine/native/camera-surface';
import type { SightPreviewProps } from './sight-preview-props';

const log = new Logger('app.assistant-call');

const FILL = { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 } as const;

const CAPTURE = { skipProcessing: true, shutterSound: false, exif: false, quality: 0.6 } as const;

export function PhoneCamera({ facing, light, label }: SightPreviewProps): ReactNode {
  const camera = useRef<CameraView | null>(null);
  const surface = useRef<CameraSurface | null>(null);
  const [pictureSize, setPictureSize] = useState<string | undefined>(undefined);
  const ready = (): void => {
    const view = camera.current;
    if (view === null) {
      return;
    }
    view
      .getAvailablePictureSizesAsync()
      .then((sizes) => {
        setPictureSize(pictureSizeOf(sizes) ?? undefined);
      })
      .catch((error: unknown) => {
        log.warn('call.camera_sizes_unavailable', { reason: rawErrorText(error) });
      });
    const next: CameraSurface = {
      capture: async (): Promise<string> => (await view.takePictureAsync(CAPTURE)).uri,
    };
    surface.current = next;
    cameraSurfaces.attach(next);
  };
  useEffect(
    () => (): void => {
      if (surface.current !== null) {
        cameraSurfaces.detach(surface.current);
      }
    },
    [],
  );
  return (
    <CameraView
      ref={camera}
      accessibilityLabel={label}
      facing={facing === 'front' ? 'front' : 'back'}
      enableTorch={light}
      pictureSize={pictureSize}
      onCameraReady={ready}
      mute
      style={FILL}
    />
  );
}
