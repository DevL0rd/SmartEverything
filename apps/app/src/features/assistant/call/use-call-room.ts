import { useWindowDimensions, type View } from 'react-native';
import { useRef, type RefObject } from 'react';
import type { SharedValue } from 'react-native-reanimated';
import type { CallAudioPref, DesktopCaptureMode, SightFacing } from '@smarteverything/domain';
import { appPlatform, useIdiom } from '../../../design/platform';
import { useAreaWidth } from '../../../design/size-class';
import { heavyThud, selectionTick } from '../../../platform/haptics';
import { useEscape } from '../../../components/use-escape';
import { useAssistantName } from '../data/assistant-data';
import {
  answerRequest,
  flipCamera,
  interruptAssistant,
  openSystemSettings,
  pauseCamera,
  startCamera,
  startPick,
  stopCamera,
  stopSharing,
} from './call-actions';
import { callActive, changeCall, useCall, type CallMissed, type CallView } from './call-state';
import { useCallLevel } from './components/use-call-level';
import type { StageActions } from './components/stage-views';
import { useCaptureMode } from './components/use-capture-sources';
import { callEngine } from './engine/engine';
import { callLayoutOf, type CallLayout } from './model/call-layout';
import { reasonsOf, type CallControlHandlers, type ControlReasons } from './model/call-controls';
import { missedActionOf, missedOf } from './model/call-missed';
import type { SourcePick } from './model/call-sources';
import { useCallAudio } from './settings-sheet/call-audio-pref';
import { useCallAnnouncements, useCallNotices } from './use-call-announcements';
import {
  HOME_PICKER,
  WINDOW_PICKER,
  useCallLayers,
  type CallLayers,
  type CallPage,
} from './use-call-layers';
import { useCallShortcuts } from './use-call-shortcuts';

const PHONE_SCREEN: SourcePick = {
  kind: 'app',
  start: { source: 'phone_screen' },
  label: 'Phone screen',
};

const SYSTEM_SCREEN: SourcePick = {
  kind: 'desktop',
  source: 'desktop_screen',
  captureId: null,
  label: 'Screen',
};

export interface CallRoomModel {
  readonly call: CallView;
  readonly name: string;
  readonly layout: CallLayout;
  readonly level: SharedValue<number>;
  readonly layers: CallLayers;
  readonly pref: CallAudioPref;
  readonly reasons: ControlReasons;
  readonly handlers: CallControlHandlers;
  readonly captureMode: DesktopCaptureMode | null;
  readonly screenSharePage: CallPage | null;
  readonly shareScreen: () => void;
  readonly cameraAnchor: RefObject<View | null>;
  readonly shareAnchor: RefObject<View | null>;
  readonly stage: StageActions & { readonly onFlip: () => void };
  readonly stoppable: boolean;
  readonly explainerStart: () => void;
  readonly answer: (accepted: boolean) => void;
  readonly expire: () => void;
  readonly showMissed: (missed: CallMissed) => void;
  readonly runAction: (action: string) => void;
}

function facingOf(pref: CallAudioPref): SightFacing {
  return appPlatform() === 'android' ? pref.facing : 'external';
}

function screenSharePageOf(captureMode: DesktopCaptureMode | null): CallPage | null {
  if (appPlatform() === 'android') {
    return { kind: 'explainer' };
  }
  return captureMode === 'picker' ? { kind: 'picker', scope: 'screen', still: false } : null;
}

interface HandlerInput {
  readonly call: CallView;
  readonly reasons: ControlReasons;
  readonly pref: CallAudioPref;
  readonly layers: CallLayers;
}

function handlersOf({ call, reasons, pref, layers }: HandlerInput): CallControlHandlers {
  return {
    onMute: (): void => {
      selectionTick();
      callEngine.mute(!call.muted);
    },
    onCamera: (): void => {
      if (reasons.camera !== null) {
        return;
      }
      selectionTick();
      if (call.video.camera === 'off') {
        startCamera(facingOf(pref));
      } else {
        layers.open({ kind: 'menu', which: 'camera' });
      }
    },
    onShare: (): void => {
      if (reasons.share === null) {
        selectionTick();
        layers.open({ kind: 'menu', which: 'share' });
      }
    },
    onSettings: (): void => {
      selectionTick();
      layers.toggleSettings();
    },
    onEnd: (): void => {
      heavyThud();
      callEngine.end();
    },
  };
}

function stageActionsOf(pref: CallAudioPref): CallRoomModel['stage'] {
  return {
    onStopSharing: stopSharing,
    onStopCamera: stopCamera,
    onResume: (): void => {
      pauseCamera(false);
    },
    onRetryCamera: (): void => {
      startCamera(facingOf(pref));
    },
    onOpenSettings: openSystemSettings,
    onStopTalking: interruptAssistant,
    onFlip: flipCamera,
  };
}

function useRoomEffects(
  call: CallView,
  layout: CallLayout,
  layers: CallLayers,
  handlers: CallControlHandlers,
): void {
  useCallShortcuts(callActive(call), handlers);
  useCallAnnouncements(call);
  useCallNotices(call);
  useEscape(callActive(call) && layers.layer === null && call.request === null, callEngine.end);
  useEscape(layers.layer?.kind === 'settings' && layout.settings === 'panel', layers.close);
}

function actionRunner(
  reasons: ControlReasons,
  pref: CallAudioPref,
  layers: CallLayers,
  shareScreen: () => void,
): (action: string) => void {
  return (action): void => {
    if (action === 'camera' && reasons.camera === null) {
      startCamera(facingOf(pref));
    } else if (action === 'share' && reasons.share === null) {
      shareScreen();
    } else if (action === 'home') {
      layers.open(HOME_PICKER);
    } else if (action === 'settings') {
      layers.open({ kind: 'settings' });
    }
  };
}

function requestActions(
  call: CallView,
  pref: CallAudioPref,
  layers: CallLayers,
  runAction: (action: string) => void,
): Pick<CallRoomModel, 'answer' | 'expire' | 'showMissed'> {
  const answer = (accepted: boolean): void => {
    if (call.request !== null) {
      answerRequest(call.request, accepted, facingOf(pref), pref.video_mode === 'on_demand');
    }
  };
  return {
    answer,
    expire: (): void => {
      const { request } = call;
      if (request !== null) {
        changeCall(() => ({ missed: missedOf(request, Date.now()) }));
      }
      answer(false);
    },
    showMissed: (missed): void => {
      changeCall(() => ({ missed: null }));
      const action = missedActionOf(missed.what);
      if (action === 'window') {
        layers.open(WINDOW_PICKER);
      } else {
        runAction(action);
      }
    },
  };
}

export function useCallRoom(): CallRoomModel {
  const call = useCall();
  const { height } = useWindowDimensions();
  const layout = callLayoutOf({ width: useAreaWidth(), height, idiom: useIdiom() });
  const layers = useCallLayers();
  const { pref } = useCallAudio();
  const reasons = reasonsOf(call, callEngine.capabilities());
  const name = useAssistantName();
  const level = useCallLevel(call.phase, call.muted);
  const cameraAnchor = useRef<View>(null);
  const shareAnchor = useRef<View>(null);
  const captureMode = useCaptureMode();
  const screenSharePage = screenSharePageOf(captureMode);
  const shareScreen = (): void => {
    if (screenSharePage === null) {
      startPick(SYSTEM_SCREEN, false);
      return;
    }
    layers.open(screenSharePage);
  };
  const handlers = handlersOf({ call, reasons, pref, layers });
  const runAction = actionRunner(reasons, pref, layers, shareScreen);
  useRoomEffects(call, layout, layers, handlers);
  return {
    call,
    name,
    layout,
    level,
    layers,
    pref,
    reasons,
    handlers,
    captureMode,
    screenSharePage,
    shareScreen,
    cameraAnchor,
    shareAnchor,
    stage: stageActionsOf(pref),
    stoppable: pref.echo === 'no_interrupt' && call.phase === 'speaking',
    explainerStart: (): void => {
      layers.close();
      startPick(PHONE_SCREEN, false);
    },
    ...requestActions(call, pref, layers, runAction),
    runAction,
  };
}
