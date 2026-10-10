import { APP_SIGHT_SOURCES, type AppSightSource } from '@smarteverything/domain';
import { assistantCallCan, assistantCallLinked } from '../../../../../../modules/health-connect';
import { callState } from '../../call-state';
import type { EngineCapabilities } from '../call-engine';
import { NOT_ON_THIS_BUILD } from '../unavailable';

const HUB_TOO_OLD_FOR_VIDEO = 'Update your home server to share video.';

export const HUB_TOO_OLD = 'Update your home server to use this during a call.';

const COMPUTER_ONLY = 'Sharing a computer screen or window needs the desktop app.';

export const CALL_SERVICE_REFUSED_CODE = 1011;

function nativeReason(operation: Parameters<typeof assistantCallCan>[0]): string | null {
  return assistantCallCan(operation) ? null : NOT_ON_THIS_BUILD;
}

function hubReason(source: AppSightSource): string | null {
  const { phase, capabilities } = callState.get();
  if (capabilities === null) {
    return phase === 'idle' || phase === 'connecting' ? null : HUB_TOO_OLD_FOR_VIDEO;
  }
  return capabilities.sight.includes(source) ? null : HUB_TOO_OLD_FOR_VIDEO;
}

function sightReason(source: AppSightSource): string | null {
  switch (source) {
    case 'phone_camera':
      return nativeReason('setAssistantCallCamera') ?? hubReason(source);
    case 'phone_screen':
      return nativeReason('startAssistantScreenShare') ?? hubReason(source);
    case 'desktop_screen':
    case 'desktop_window':
      return COMPUTER_ONLY;
  }
}

export function nativeCapabilities(): EngineCapabilities {
  return {
    sight: {
      phone_camera: sightReason('phone_camera'),
      phone_screen: sightReason('phone_screen'),
      desktop_screen: sightReason('desktop_screen'),
      desktop_window: sightReason('desktop_window'),
    },
    audio: nativeReason('applyAssistantCallAudio'),
    echoTest: nativeReason('runAssistantEchoTest'),
    light: nativeReason('setAssistantCallCamera'),
  };
}

export function reachableSources(): AppSightSource[] {
  const { sight } = nativeCapabilities();
  return APP_SIGHT_SOURCES.filter((source) => sight[source] === null);
}

export function linkedReason(): string | null {
  return assistantCallLinked()
    ? null
    : 'Install the newest SmartEverything app to call the assistant.';
}
