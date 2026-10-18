import { router } from 'expo-router';
import { background } from '@smarteverything/logging';
import type { OVERLAY_SIMPLE_ACTIONS, OverlayAction } from '@smarteverything/domain';
import { desktopBridge } from '../../../design/platform';
import {
  answerRequest,
  attempt,
  interruptAssistant,
  pauseCamera,
  startCamera,
  startPick,
  stopCamera,
  stopSharing,
} from '../call/call-actions';
import { callActive, callState, type CallView } from '../call/call-state';
import { callEngine } from '../call/engine/engine';
import type { SourcePick } from '../call/model/call-sources';
import { startCall } from '../call/start-call';
import { dismissKeyOf, wakeKeyOf } from './overlay-driver';
import { clearWake, dismissOverlay, overlayExtras } from './overlay-state';

type RoomAction = 'camera' | 'share' | 'home' | 'settings';

export interface OverlayActionPorts {
  readonly call: () => CallView;
  readonly mute: (muted: boolean) => void;
  readonly end: () => void;
  readonly restart: () => void;
  readonly fixMicrophone: () => void;
  readonly dismiss: () => void;
  readonly openRoom: (action: RoomAction | null) => void;
  readonly startCamera: () => void;
  readonly stopCamera: () => void;
  readonly pauseVideo: (paused: boolean) => void;
  readonly shareScreen: (still: boolean) => void;
  readonly stopSharing: () => void;
  readonly interrupt: () => void;
  readonly speaker: () => void;
  readonly captions: () => void;
  readonly microphone: (id: string | null) => void;
  readonly volume: (value: number) => void;
  readonly answer: (accepted: boolean) => void;
}

const SYSTEM_SCREEN: SourcePick = {
  kind: 'desktop',
  source: 'desktop_screen',
  captureId: null,
  label: 'Screen',
};

type SimpleKind = (typeof OVERLAY_SIMPLE_ACTIONS)[number];

type Handler = (ports: OverlayActionPorts) => void;

function toggleCamera(ports: OverlayActionPorts): void {
  const { camera } = ports.call().video;
  if (camera === 'on' || camera === 'paused' || camera === 'starting') {
    ports.stopCamera();
  } else {
    ports.startCamera();
  }
}

const HANDLERS: Readonly<Record<SimpleKind, Handler>> = {
  mute: (ports) => {
    ports.mute(!ports.call().muted);
  },
  speaker: (ports) => {
    ports.speaker();
  },
  end: (ports) => {
    ports.end();
  },
  retry: (ports) => {
    ports.dismiss();
    ports.restart();
  },
  fix: (ports) => {
    ports.fixMicrophone();
  },
  close: (ports) => {
    ports.dismiss();
  },
  open: (ports) => {
    ports.openRoom(null);
  },
  camera: toggleCamera,
  pause_video: (ports) => {
    ports.pauseVideo(ports.call().video.camera !== 'paused');
  },
  show_this: (ports) => {
    ports.shareScreen(true);
  },
  share_screen: (ports) => {
    ports.shareScreen(false);
  },
  share_window: (ports) => {
    ports.openRoom('share');
  },
  stop_share: (ports) => {
    ports.stopSharing();
  },
  home_camera: (ports) => {
    ports.openRoom('home');
  },
  interrupt: (ports) => {
    ports.interrupt();
  },
  captions: (ports) => {
    ports.captions();
  },
  settings: (ports) => {
    ports.openRoom('settings');
  },
  accept_request: (ports) => {
    ports.answer(true);
  },
  decline_request: (ports) => {
    ports.answer(false);
  },
};

export function runOverlayAction(action: OverlayAction, ports: OverlayActionPorts): void {
  if (action.kind === 'mic') {
    ports.microphone(action.id);
  } else if (action.kind === 'volume') {
    ports.volume(action.value);
  } else {
    HANDLERS[action.kind](ports);
  }
}

function dismissCurrent(): void {
  const key = dismissKeyOf(callState.get()) ?? wakeKeyOf(overlayExtras.get().wake);
  if (key !== null) {
    dismissOverlay(key);
  }
  clearWake();
}

function openRoom(action: RoomAction | null): void {
  background(desktopBridge()?.attention?.(), 'overlay.attention_failed');
  router.navigate({
    pathname: '/assistant/call',
    params: { source: 'chat', ...(action === null ? {} : { action }) },
  });
}

function shareScreen(still: boolean): void {
  attempt(still ? 'The picture was not taken' : 'Sharing did not start', async () => {
    const mode = (await desktopBridge()?.captureMode?.()) ?? 'picker';
    if (mode === 'portal') {
      startPick(SYSTEM_SCREEN, still);
    } else {
      openRoom('share');
    }
  });
}

function restartCall(): void {
  if (!callActive(callState.get())) {
    startCall({ source: 'shortcut' });
  }
}

function fixMicrophone(): void {
  attempt('The microphone settings did not open', async () => {
    if (await callEngine.allowMicrophone()) {
      dismissCurrent();
      restartCall();
    }
  });
}

export const CALL_PORTS = {
  call: callState.get,
  mute: callEngine.mute,
  end: callEngine.end,
  restart: restartCall,
  fixMicrophone,
  dismiss: dismissCurrent,
  openRoom,
  startCamera: (): void => {
    startCamera('external');
  },
  stopCamera,
  pauseVideo: pauseCamera,
  shareScreen,
  stopSharing,
  interrupt: interruptAssistant,
  answer: (accepted: boolean): void => {
    const { request } = callState.get();
    if (request !== null) {
      answerRequest(request, accepted, 'external', false);
    }
  },
} as const;
