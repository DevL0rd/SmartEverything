import { APP_SIGHT_SOURCES, type AppSightSource } from '@smarteverything/domain';
import { webTalkSupport } from '../../../../talk';
import { callState } from '../../call-state';
import type { EngineCapabilities } from '../call-engine';
import { sightApis } from './sight-devices';

export const HUB_TOO_OLD_FOR_VIDEO = 'Update your home server to share video.';

export const HUB_TOO_OLD = 'Update your home server to use this during a call.';

const PHONE_SCREEN = 'Sharing a phone screen needs the Android app.';

const NO_CAMERA = 'This browser cannot open a camera.';

const NO_SCREEN = 'This browser cannot share a screen or window.';

const NO_PICTURES =
  'This browser cannot prepare pictures for the assistant. Use Chrome or the desktop app.';

const NO_ECHO_TEST = 'This browser cannot play and record at the same time.';

function hubReason(source: AppSightSource): string | null {
  const { phase, capabilities } = callState.get();
  if (capabilities === null) {
    return phase === 'idle' || phase === 'connecting' ? null : HUB_TOO_OLD_FOR_VIDEO;
  }
  return capabilities.sight.includes(source) ? null : HUB_TOO_OLD_FOR_VIDEO;
}

function pictureReason(source: AppSightSource, pictures: boolean): string | null {
  return pictures ? hubReason(source) : NO_PICTURES;
}

function sightReason(source: AppSightSource): string | null {
  const apis = sightApis();
  switch (source) {
    case 'phone_camera':
      return apis.camera ? pictureReason(source, apis.pictures) : NO_CAMERA;
    case 'phone_screen':
      return PHONE_SCREEN;
    case 'desktop_screen':
    case 'desktop_window':
      return apis.screen ? pictureReason(source, apis.pictures) : NO_SCREEN;
  }
}

export function engineCapabilities(light: string | null): EngineCapabilities {
  return {
    sight: {
      phone_camera: sightReason('phone_camera'),
      phone_screen: sightReason('phone_screen'),
      desktop_screen: sightReason('desktop_screen'),
      desktop_window: sightReason('desktop_window'),
    },
    audio: webTalkSupport(),
    echoTest: webTalkSupport() ?? (typeof AudioContext === 'undefined' ? NO_ECHO_TEST : null),
    light,
  };
}

export function reachableSources(): AppSightSource[] {
  const { sight } = engineCapabilities(null);
  return APP_SIGHT_SOURCES.filter((source) => sight[source] === null);
}
