import { useWindowDimensions, type View } from 'react-native';
import { useRef, type RefObject } from 'react';
import type { SharedValue } from 'react-native-reanimated';
import type { CallAudioPref, SightFacing } from '@smarteverything/domain';
import type { MenuItem } from '../../../components/menu-rows';
import { appPlatform, useIdiom } from '../../../design/platform';
import { useAreaWidth } from '../../../design/size-class';
import { heavyThud, selectionTick } from '../../../platform/haptics';
import { useEscape } from '../../../components/use-escape';
import { useAssistantName } from '../data/assistant-data';
import {
  answerRequest,
  chooseFacing,
  flipCamera,
  interruptAssistant,
  openSystemSettings,
  pauseCamera,
  setCameraLight,
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
import { cameraMenuOf, shareMenuOf } from './model/call-menus';
import { missedActionOf, missedOf } from './model/call-missed';
import type { SourcePick } from './model/call-sources';
import { useCallAudio } from './settings-sheet/call-audio-pref';
import { useCallAnnouncements, useCallNotices } from './use-call-announcements';
import { useCallLayers, type CallLayers } from './use-call-layers';
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
  readonly cameraMenu: readonly MenuItem[];
  readonly shareMenu: readonly MenuItem[];
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

function openHomePicker(layers: CallLayers): void {
  layers.open({ kind: 'picker', scope: 'home', still: false });
}

function useShareScreen(layers: CallLayers): () => void {
  const captureMode = useCaptureMode();
  return (): void => {
    if (appPlatform() === 'android') {
      layers.open({ kind: 'explainer' });
    } else if (captureMode === 'picker') {
      layers.open({ kind: 'picker', scope: 'screen', still: false });
    } else {
      startPick(SYSTEM_SCREEN, false);
    }
  };
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

function useRoomMenus(
  call: CallView,
  layers: CallLayers,
  shareScreen: () => void,
): Pick<CallRoomModel, 'cameraMenu' | 'shareMenu'> {
  const captureMode = useCaptureMode();
  return {
    cameraMenu: cameraMenuOf(call, callEngine.capabilities(), {
      onFacing: chooseFacing,
      onPause: pauseCamera,
      onLight: setCameraLight,
      onHome: (): void => {
        openHomePicker(layers);
      },
      onStop: stopCamera,
    }),
    shareMenu: shareMenuOf(call, appPlatform(), captureMode === 'picker', {
      onScreen: shareScreen,
      onWindow: (): void => {
        layers.open({ kind: 'picker', scope: 'window', still: false });
      },
      onHome: (): void => {
        openHomePicker(layers);
      },
      onStop: stopSharing,
    }),
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
      openHomePicker(layers);
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
        layers.open({ kind: 'picker', scope: 'window', still: false });
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
  const shareScreen = useShareScreen(layers);
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
    ...useRoomMenus(call, layers, shareScreen),
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
