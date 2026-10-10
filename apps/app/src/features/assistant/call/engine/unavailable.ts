import type { AppSightSource } from '@smarteverything/domain';
import type { CallFeatureEngine, EngineCapabilities } from './call-engine';

export const NOT_ON_THIS_BUILD = 'This version of the app cannot do that during a call yet.';

export class CallFeatureUnavailableError extends Error {
  override readonly name = 'CallFeatureUnavailableError';

  constructor(
    readonly feature: string,
    readonly reason: string,
  ) {
    super(`${feature} is not available: ${reason}`);
  }
}

function refuse(feature: string): never {
  throw new CallFeatureUnavailableError(feature, NOT_ON_THIS_BUILD);
}

function refused(feature: string): Promise<never> {
  return Promise.reject(new CallFeatureUnavailableError(feature, NOT_ON_THIS_BUILD));
}

const NO_SIGHT: Readonly<Record<AppSightSource, string | null>> = {
  phone_camera: NOT_ON_THIS_BUILD,
  phone_screen: NOT_ON_THIS_BUILD,
  desktop_screen: NOT_ON_THIS_BUILD,
  desktop_window: NOT_ON_THIS_BUILD,
};

export const UNAVAILABLE_FEATURES: CallFeatureEngine = {
  capabilities: (): EngineCapabilities => ({
    sight: NO_SIGHT,
    audio: NOT_ON_THIS_BUILD,
    echoTest: NOT_ON_THIS_BUILD,
    light: NOT_ON_THIS_BUILD,
  }),
  applyAudio: () => refuse('Live call settings'),
  startSight: () => refused('Sharing a camera or screen'),
  stopSight: () => refuse('Stopping a share'),
  switchCamera: () => refused('Switching the camera'),
  pauseSight: () => refuse('Pausing the video'),
  setLight: () => refuse('The camera light'),
  showThis: () => refused('Showing a picture'),
  watchCamera: () => refuse('Showing a home camera'),
  answerRequest: () => refuse('Answering a request to look'),
  echoTest: () => refused('The echo test'),
  interrupt: () => refuse('Interrupting the assistant'),
};
