import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { useUniwind } from 'uniwind';
import type {
  OverlayAudio,
  OverlayHostView,
  OverlayPrefs,
  OverlayTheme,
} from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import {
  addOverlayActionListener,
  applyAssistantCallAudio,
  overlayLinked,
  setOverlayPrefs,
} from '../../../../modules/health-connect';
import { useValue } from '../../../design/external-store';
import { useMotion } from '../../../design/motion';
import { desktopBridge, type DesktopBridge } from '../../../design/platform';
import { useEntityStore } from '../../../store/store-context';
import { useAssistantName } from '../data/assistant-data';
import { useAiChat } from '../data/chat-store';
import { useDesktopHarness } from '../data/desktop-harness';
import { useCallAudioDevices } from '../call/audio-devices';
import { callState, useCall, type CallView } from '../call/call-state';
import { callEngine } from '../call/engine/engine';
import { reasonsOf } from '../call/model/call-controls';
import { nativeAudioOf } from '../call/engine/native/native-audio';
import { callAudioOf, saveCallAudio, useCallAudio } from '../call/settings-sheet/call-audio-pref';
import {
  endHostedCall,
  hostedActive,
  hostedVoice,
  muteHostedCall,
  ownComputerOf,
  setOwnComputer,
  watchHostedLevels,
  type HostedVoice,
} from './hosted-voice';
import { CALL_LEVEL_PORTS, LevelPort } from './level-port';
import { CALL_PORTS, runOverlayAction, type OverlayActionPorts } from './overlay-actions';
import { announceOverlay, answerShortcut, overlayAnnouncePorts } from './overlay-announce';
import { FirstSeen, OverlayDriver, overlayInputOf, type OverlaySources } from './overlay-driver';
import { OverlayPermissionBanner } from './overlay-permission-banner';
import { toggleCaptions, useOverlayPrefs } from './overlay-settings';
import { clearWake, overlayExtras, setOverlayHold, type OverlayExtras } from './overlay-state';
import {
  inShareOf,
  overlayPlatform,
  surfaceFacts,
  surfaceOf,
  useSurfaceEvents,
  type SurfaceFacts,
} from './overlay-surface';
import { useAnswerShortcut } from './use-answer-shortcut';
import { useAssistantShortcut } from './use-assistant-shortcut';

interface Runtime {
  readonly driver: OverlayDriver;
  readonly levels: LevelPort;
  readonly problems: FirstSeen;
  readonly requests: FirstSeen;
}

function followVoice(levels: LevelPort, view: OverlayHostView): void {
  const hosted = callState.get().phase === 'idle' ? hostedVoice.get() : null;
  const callId = hostedActive(hosted) ? hosted.callId : callState.get().callId;
  levels.follow(view, callId);
  const wanted = hostedActive(hosted) && view.state !== 'hidden';
  watchHostedLevels(wanted ? hosted.callId : null);
}

function createRuntime(bridge: DesktopBridge): Runtime {
  const levels = new LevelPort(CALL_LEVEL_PORTS);
  const announce = overlayAnnouncePorts(() => !surfaceFacts.get().visible, answerShortcut.get);
  let previous: Parameters<typeof announceOverlay>[0] = null;
  const driver = new OverlayDriver({
    now: Date.now,
    after: (ms, run): (() => void) => {
      const timer = setTimeout(run, ms);
      return (): void => {
        clearTimeout(timer);
      };
    },
    push: (view): void => {
      announceOverlay(previous, view, announce);
      previous = view;
      followVoice(levels, view);
      background(bridge.setOverlay?.(view), 'overlay.push_failed');
    },
  });
  return { driver, levels, problems: new FirstSeen(), requests: new FirstSeen() };
}

function useActionPorts(): OverlayActionPorts {
  const store = useEntityStore();
  return {
    ...CALL_PORTS,
    speaker: (): void => {
      const { output } = callAudioOf(store.get());
      saveCallAudio(store, { output: output === 'speaker' ? 'auto' : 'speaker' }, null);
    },
    end: (): void => {
      const hosted = hostedVoice.get();
      if (callState.get().phase === 'idle' && hostedActive(hosted)) {
        endHostedCall(hosted.callId);
      } else {
        CALL_PORTS.end();
      }
    },
    mute: (muted): void => {
      const hosted = hostedVoice.get();
      if (callState.get().phase === 'idle' && hostedActive(hosted)) {
        muteHostedCall(hosted.callId, !hosted.muted);
      } else {
        CALL_PORTS.mute(muted);
      }
    },
    captions: toggleCaptions,
    microphone: (id): void => {
      saveCallAudio(store, { input: id ?? 'auto' }, null);
    },
    volume: (value): void => {
      saveCallAudio(store, { volume: value }, null);
    },
  };
}

interface Inputs {
  readonly call: CallView;
  readonly prefs: OverlayPrefs;
  readonly facts: SurfaceFacts;
  readonly extras: OverlayExtras;
  readonly hosted: HostedVoice | null;
  readonly assistant: string;
  readonly chat: string | null;
  readonly audio: OverlayAudio;
  readonly theme: OverlayTheme;
  readonly reducedMotion: boolean;
}

function useInputs(): Inputs {
  const call = useCall();
  const { pref } = useCallAudio();
  const { inputs } = useCallAudioDevices();
  const theme = useUniwind().theme === 'light' ? 'light' : 'dark';
  return {
    call,
    prefs: useOverlayPrefs(),
    facts: useValue(surfaceFacts),
    extras: useValue(overlayExtras),
    hosted: useValue(hostedVoice),
    assistant: useAssistantName(),
    chat: useAiChat(call.chatId)?.title ?? null,
    audio: {
      mics: inputs.map((device) => ({ id: device.id, label: device.label })),
      micId: pref.input === 'auto' ? null : pref.input,
      volume: pref.volume,
    },
    theme,
    reducedMotion: useMotion().reduced,
  };
}

function sourcesOf(inputs: Inputs, runtime: Runtime, now: number): OverlaySources {
  const { call } = inputs;
  return {
    prefs: inputs.prefs,
    surface: surfaceOf('desktop', inputs.facts, inShareOf(call)),
    call,
    assistant: inputs.assistant,
    chat: inputs.chat,
    reasons: reasonsOf(call, callEngine.capabilities()),
    speaker: null,
    audio: inputs.audio,
    extras: inputs.extras,
    hosted: inputs.hosted,
    problemAt: runtime.problems.at(
      call.problem === null ? null : `${call.callId ?? ''}:${call.problem}`,
      now,
    ),
    requestAt: runtime.requests.at(call.request?.requestId ?? null, now),
  };
}

function useRuntime(bridge: DesktopBridge): Runtime {
  const [runtime] = useState(() => createRuntime(bridge));
  useEffect(
    () => (): void => {
      runtime.driver.stop();
      runtime.levels.close();
    },
    [runtime],
  );
  return runtime;
}

function useDriven(bridge: DesktopBridge, inputs: Inputs): void {
  const runtime = useRuntime(bridge);
  useEffect(() => {
    const sources = sourcesOf(inputs, runtime, Date.now());
    runtime.driver.update({
      input: overlayInputOf(sources),
      theme: inputs.theme,
      reducedMotion: inputs.reducedMotion,
    });
  }, [inputs, runtime]);
}

function useActions(bridge: DesktopBridge): void {
  const ports = useActionPorts();
  useEffect(() => {
    return bridge.onOverlayAction?.((action) => {
      runOverlayAction(action, ports);
    });
  }, [bridge, ports]);
}

function useOwnComputer(): void {
  const computer = ownComputerOf(useDesktopHarness().target);
  useEffect(() => {
    setOwnComputer(computer);
  }, [computer]);
}

function useHold(bridge: DesktopBridge): void {
  useEffect(() => bridge.onOverlayHold?.(setOverlayHold), [bridge]);
}

function useWakeLifecycle(call: CallView): void {
  const started = call.phase !== 'idle';
  useEffect(() => {
    if (started) {
      clearWake();
    }
  }, [started]);
}

function DesktopOverlay({ bridge }: { readonly bridge: DesktopBridge }): null {
  const inputs = useInputs();
  useDriven(bridge, inputs);
  useActions(bridge);
  useHold(bridge);
  useOwnComputer();
  useWakeLifecycle(inputs.call);
  useAssistantShortcut();
  useAnswerShortcut();
  return null;
}

function usePhoneNative(): void {
  const prefs = useOverlayPrefs();
  const theme = useUniwind().theme === 'light' ? 'light' : 'dark';
  const { pref } = useCallAudio();
  const ports = useActionPorts();
  useEffect(() => {
    background(setOverlayPrefs({ ...prefs, theme }), 'overlay.prefs_failed');
  }, [prefs, theme]);
  useEffect(() => {
    background(applyAssistantCallAudio(nativeAudioOf(pref)), 'overlay.audio_failed');
  }, [pref]);
  useEffect(() => {
    if (!overlayLinked()) {
      return undefined;
    }
    return addOverlayActionListener((action) => {
      runOverlayAction(action, ports);
    }).remove;
  }, [ports]);
}

function PhoneOverlay(): ReactNode {
  usePhoneNative();
  return <OverlayPermissionBanner />;
}

export function OverlayHost(): ReactNode {
  useSurfaceEvents();
  const bridge = desktopBridge();
  const platform = overlayPlatform();
  if (platform === 'phone') {
    return <PhoneOverlay />;
  }
  return platform === 'desktop' && bridge !== null ? <DesktopOverlay bridge={bridge} /> : null;
}
