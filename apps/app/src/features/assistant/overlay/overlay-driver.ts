import type {
  OverlayAudio,
  OverlayCall,
  OverlayHostView,
  OverlayInput,
  OverlayPrefs,
  OverlaySharing,
  OverlaySurface,
  OverlayTheme,
  OverlayView,
  OverlayVoice,
} from '@smarteverything/domain';
import { overlayView } from '@smarteverything/domain';
import type { CallView } from '../call/call-state';
import type { HostedVoice } from './hosted-voice';
import type { OverlayExtras } from './overlay-state';

export interface OverlaySources {
  readonly prefs: OverlayPrefs;
  readonly surface: OverlaySurface;
  readonly call: CallView;
  readonly assistant: string;
  readonly chat: string | null;
  readonly reasons: { readonly camera: string | null; readonly share: string | null };
  readonly speaker: boolean | null;
  readonly audio: OverlayAudio;
  readonly extras: OverlayExtras;
  readonly hosted: HostedVoice | null;
  readonly voice: OverlayVoice | null;
  readonly problemAt: number | null;
  readonly requestAt: number | null;
}

export interface DriverInput {
  readonly input: Omit<OverlayInput, 'now'>;
  readonly theme: OverlayTheme;
  readonly reducedMotion: boolean;
}

export interface DriverPorts {
  readonly now: () => number;
  readonly after: (ms: number, run: () => void) => () => void;
  readonly push: (view: OverlayHostView) => void;
}

const REQUEST_WAIT_MS = 30_000;

function overlaySharingOf(call: CallView): OverlaySharing | null {
  const { sight, video } = call;
  if (sight?.source === 'desktop_window') {
    return { kind: 'window', label: sight.label };
  }
  const screen =
    sight?.source === 'desktop_screen' ||
    sight?.source === 'phone_screen' ||
    video.screen !== 'off';
  return screen ? { kind: 'screen', label: sight?.label ?? null } : null;
}

function hostedCallOf(sources: OverlaySources): OverlayCall | null {
  const { hosted } = sources;
  if (hosted === null) {
    return null;
  }
  return {
    phase: hosted.phase,
    muted: hosted.muted,
    heard: hosted.heard,
    said: hosted.said,
    tool: hosted.tool,
    problem: null,
    startedAt: hosted.startedAt,
    endedAt: hosted.endedAt,
    assistant: sources.assistant,
    chat: null,
    camera: 'off',
    speaker: null,
    sharing: null,
    request: null,
    reasons: sources.reasons,
    hosted: true,
  };
}

export function overlayCallOf(sources: OverlaySources): OverlayCall | null {
  const { call, extras } = sources;
  if (call.phase === 'idle') {
    return hostedCallOf(sources);
  }
  if (isDismissed(extras, dismissKeyOf(call))) {
    return null;
  }
  const { request } = call;
  return {
    phase: call.phase,
    muted: call.muted,
    heard: call.heard,
    said: call.said,
    tool: call.tools.at(-1) ?? null,
    problem:
      call.problem === null
        ? null
        : {
            text: call.problem,
            at: call.endedAt ?? sources.problemAt ?? 0,
            fix: call.fix,
          },
    startedAt: call.startedAt,
    endedAt: call.endedAt,
    assistant: sources.assistant,
    chat: sources.chat,
    camera: call.video.camera,
    speaker: sources.speaker,
    sharing: overlaySharingOf(call),
    request:
      request === null
        ? null
        : {
            what: request.what,
            why: request.why,
            expiresAt: (sources.requestAt ?? 0) + REQUEST_WAIT_MS,
          },
    reasons: sources.reasons,
  };
}

function isDismissed(extras: OverlayExtras, key: string | null): boolean {
  return key !== null && extras.dismissed === key;
}

export function dismissKeyOf(call: CallView): string | null {
  if (call.phase !== 'ended') {
    return null;
  }
  return `call:${call.callId ?? ''}:${String(call.endedAt ?? 0)}:${call.problem ?? ''}`;
}

export function wakeKeyOf(wake: { readonly at: number } | null): string | null {
  return wake === null ? null : `wake:${String(wake.at)}`;
}

export function overlayInputOf(sources: OverlaySources): Omit<OverlayInput, 'now'> {
  const { extras } = sources;
  const wake = isDismissed(extras, wakeKeyOf(extras.wake)) ? null : extras.wake;
  return {
    prefs: sources.prefs,
    surface: sources.surface,
    call: overlayCallOf(sources),
    wake,
    superseded: extras.superseded,
    audio: sources.audio,
    hold: extras.hold,
    voice: sources.voice,
  };
}

export class FirstSeen {
  private key: string | null = null;
  private seenAt = 0;

  at(key: string | null, now: number): number | null {
    if (key === null) {
      this.key = null;
      return null;
    }
    if (key !== this.key) {
      this.key = key;
      this.seenAt = now;
    }
    return this.seenAt;
  }
}

export class OverlayDriver {
  private current: DriverInput | null = null;
  private cancel: (() => void) | null = null;
  private shown = false;
  private pushed = '';
  private latest: OverlayView | null = null;

  constructor(private readonly ports: DriverPorts) {}

  get view(): OverlayView | null {
    return this.latest;
  }

  update(next: DriverInput): void {
    this.current = next;
    this.evaluate();
  }

  stop(): void {
    this.cancel?.();
    this.cancel = null;
    this.current = null;
  }

  private evaluate(): void {
    const { current } = this;
    if (current === null) {
      return;
    }
    const now = this.ports.now();
    const view = overlayView({ ...current.input, now });
    this.latest = view;
    this.publish(view, current);
    this.cancel?.();
    this.cancel =
      view.changesAt === null
        ? null
        : this.ports.after(Math.max(1, view.changesAt - now), () => {
            this.evaluate();
          });
  }

  private publish(view: OverlayView, current: DriverInput): void {
    const hidden = view.state === 'hidden';
    if (hidden && !this.shown) {
      return;
    }
    const host: OverlayHostView = {
      ...view,
      prefs: current.input.prefs,
      theme: current.theme,
      reducedMotion: current.reducedMotion,
    };
    const key = JSON.stringify(host);
    if (key === this.pushed) {
      return;
    }
    this.pushed = key;
    this.shown = !hidden;
    this.ports.push(host);
  }
}
