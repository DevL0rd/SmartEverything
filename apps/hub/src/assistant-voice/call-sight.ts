import {
  DEFAULT_SIGHT_LOOK,
  SIGHT_FRAME_LIMITS,
  SIGHT_MEMORY_DEFAULT_SECONDS,
  SIGHT_SAMPLING,
  type AssistantVoiceClientMessage,
  type AssistantVoiceServerMessage,
  type CallSightRow,
  type SightFrame,
  type SightMode,
  type SightResolution,
  type SightSource,
  type SightStopReason,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { HubToolResult } from '../ai-tools/hub-tool';
import { Looks, type LookContext, type Seen } from './call-look';
import type { Picture } from './gemini';
import type { HomeCameras } from './home-cameras';
import type { SightTuning } from './live-window';
import type { ToolAnswer } from './tool-answer';
import type { VideoFrame } from './video';

type StateChange = Omit<
  Extract<AssistantVoiceServerMessage, { type: 'sight_state' }>,
  'type' | 'callId'
>;

type Message<T extends AssistantVoiceClientMessage['type']> = Extract<
  AssistantVoiceClientMessage,
  { type: T }
>;

export interface SightPorts {
  readonly callId: string;
  readonly send: (message: AssistantVoiceServerMessage) => void;
  readonly video: (frame: VideoFrame) => void;
  readonly note: (text: string, picture?: Picture, respond?: boolean) => void;
  readonly tune: (tuning: SightTuning | null) => void;
  readonly record: (text: string) => void;
  readonly delegate: (args: Readonly<Record<string, unknown>>) => Promise<HubToolResult>;
  readonly cameras: HomeCameras;
  readonly blocked: () => string | null;
  readonly now: () => Date;
  readonly time: (at: Date) => string;
  readonly log: Logger;
}

interface Active {
  readonly source: SightSource;
  readonly label: string;
  readonly since: Date;
  readonly cameraId: string | null;
  detach: (() => void) | null;
}

interface ExpectedStill {
  readonly lookId: string;
  readonly source: SightSource;
  readonly label: string;
}

const SOURCE_TEXT: Readonly<Record<SightSource, string>> = {
  home_camera: 'a camera of the home',
  phone_camera: 'their phone camera',
  phone_screen: 'their phone screen',
  desktop_screen: 'their computer screen',
  desktop_window: 'a window on their computer',
};

const SOURCE_LABEL: Readonly<Record<SightSource, string>> = {
  home_camera: 'Home camera',
  phone_camera: 'Phone camera',
  phone_screen: 'Phone screen',
  desktop_screen: 'Computer screen',
  desktop_window: 'Window',
};

function pictureOf(frame: SightFrame): Picture {
  return { data: Buffer.from(frame.jpeg), mimeType: 'image/jpeg' };
}

export class CallSight {
  private mode: SightMode = 'live';
  private memorySeconds: number = SIGHT_MEMORY_DEFAULT_SECONDS;
  private look: ReadonlySet<SightSource> = new Set(DEFAULT_SIGHT_LOOK);
  private available: ReadonlySet<SightSource> = new Set();
  private active: Active | null = null;
  private expected: ExpectedStill | null = null;
  private resolution: SightResolution | null = null;
  private lastFrameAt = 0;
  private dropped = 0;
  private taken = 0;
  private readonly looks: Looks;

  constructor(private readonly ports: SightPorts) {
    this.looks = new Looks({
      callId: ports.callId,
      send: ports.send,
      note: ports.note,
      delegate: ports.delegate,
      context: (): LookContext => ({ look: this.look, available: this.available }),
      looked: (source, label): void => {
        this.taken += 1;
        this.touch(source);
        this.retune();
        this.ports.log.info('voice.sight_looked', { callId: ports.callId, source, label });
      },
      now: ports.now,
      log: ports.log,
    });
  }

  get row(): CallSightRow | null {
    return this.active === null
      ? null
      : { source: this.active.source, label: this.active.label, mode: this.mode };
  }

  get looksTaken(): number {
    return this.taken;
  }

  settings(message: Message<'sight_settings'>): void {
    const changed = message.mode !== this.mode;
    this.mode = message.mode;
    this.memorySeconds = message.memorySeconds;
    this.look = new Set(message.look);
    this.available = new Set(message.available);
    if (this.active !== null) {
      this.restream();
      if (changed) {
        this.ports.note(this.modeNote(this.active.source));
      }
    }
    this.retune();
  }

  start(message: Message<'sight_start'>): void {
    const blocked = this.ports.blocked();
    if (blocked !== null) {
      this.offState(message.source, 'budget', blocked, null);
      return;
    }
    this.activate({
      source: message.source,
      label: message.label ?? SOURCE_LABEL[message.source],
      cameraId: null,
    });
  }

  watch(cameraId: string): void {
    const label = this.ports.cameras.name(cameraId);
    const blocked = this.ports.blocked();
    if (blocked !== null) {
      this.offState('home_camera', 'budget', blocked, label);
      return;
    }
    this.activate({ source: 'home_camera', label, cameraId });
  }

  stop(source: SightSource, reason: SightStopReason): void {
    if (this.active?.source === source) {
      this.finish(reason, null);
    }
  }

  stopAny(reason: SightStopReason, detail: string | null = null): boolean {
    if (this.active === null) {
      return false;
    }
    this.finish(reason, detail);
    return true;
  }

  announce(message: Message<'sight_still'>): void {
    this.expected = { lookId: message.lookId, source: message.source, label: message.label };
  }

  frame(frame: SightFrame): void {
    if (frame.still) {
      this.stillFrame(frame);
      return;
    }
    const active = this.active;
    if (active?.source !== frame.source || this.mode !== 'live') {
      this.drop('not_streaming', frame.source);
      return;
    }
    this.relay({ data: Buffer.from(frame.jpeg), mimeType: 'image/jpeg' }, active);
  }

  see(args: Readonly<Record<string, unknown>>): Promise<ToolAnswer> {
    return this.looks.see(args);
  }

  stopLooking(): ToolAnswer {
    const stopped = this.stopAny('requested');
    return {
      response: stopped ? { status: 'stopped' } : { status: 'nothing is being shown right now' },
      line: stopped ? 'Stopped looking' : '',
      pictures: [],
    };
  }

  answered(message: Message<'sight_answer'>): void {
    this.looks.answered(message.requestId, message.accepted);
  }

  refused(message: Message<'sight_unavailable'>): void {
    this.looks.refused(message.requestId, message.refusal, message.detail);
  }

  restate(): void {
    const active = this.active;
    if (active !== null) {
      this.tell({
        source: active.source,
        state: 'on',
        reason: null,
        detail: null,
        label: active.label,
      });
    }
  }

  budgetReached(reason: string): void {
    this.stopAny('budget', reason);
  }

  end(): void {
    this.active?.detach?.();
    this.active = null;
    this.expected = null;
    this.looks.end();
    if (this.dropped > 0) {
      this.ports.log.warn('voice.sight_frames_dropped', {
        callId: this.ports.callId,
        count: this.dropped,
      });
    }
  }

  private activate(next: Pick<Active, 'source' | 'label' | 'cameraId'>): void {
    if (this.active !== null) {
      this.finish('replaced', null);
    }
    this.active = { ...next, since: this.ports.now(), detach: null };
    this.touch(next.source);
    this.restream();
    this.tell({
      source: next.source,
      state: 'on',
      reason: null,
      detail: null,
      label: next.label,
    });
    this.ports.note(this.modeNote(next.source));
    this.ports.log.info('voice.sight_started', {
      callId: this.ports.callId,
      source: next.source,
      mode: this.mode,
    });
    this.retune();
  }

  private finish(reason: SightStopReason, detail: string | null): void {
    const active = this.active;
    if (active === null) {
      return;
    }
    active.detach?.();
    this.active = null;
    this.offState(active.source, reason, detail, active.label);
    const span = `${this.ports.time(active.since)}–${this.ports.time(this.ports.now())}`;
    this.ports.record(`Shared ${SOURCE_TEXT[active.source]} ${span}`);
    if (reason !== 'replaced') {
      this.ports.note(`[They stopped showing you ${SOURCE_TEXT[active.source]}.]`);
    }
    this.ports.log.info('voice.sight_stopped', {
      callId: this.ports.callId,
      source: active.source,
      reason,
    });
    this.retune();
  }

  private offState(
    source: SightSource,
    reason: SightStopReason,
    detail: string | null,
    label: string | null,
  ): void {
    this.tell({ source, state: 'off', reason, detail, label });
  }

  private tell(change: StateChange): void {
    this.ports.send({ type: 'sight_state', callId: this.ports.callId, ...change });
  }

  private modeNote(source: SightSource): string {
    return this.mode === 'live'
      ? `[They are showing you ${SOURCE_TEXT[source]}. Pictures reach you about once a second while it is on.]`
      : `[They turned on ${SOURCE_TEXT[source]}. Nothing streams: call see when you need to look, or they tap Show this to send you a picture.]`;
  }

  private restream(): void {
    const active = this.active;
    if (active?.cameraId === null || active === null) {
      return;
    }
    const wanted = this.mode === 'live';
    if (wanted && active.detach === null) {
      active.detach = this.ports.cameras.watch(active.cameraId, (frame) => {
        this.relay(frame, active);
      });
    } else if (!wanted && active.detach !== null) {
      active.detach();
      active.detach = null;
    }
  }

  private relay(frame: VideoFrame, active: Active): void {
    const now = this.ports.now().getTime();
    if (now - this.lastFrameAt < SIGHT_FRAME_LIMITS.minIntervalMs) {
      this.drop('too_fast', active.source);
      return;
    }
    const blocked = this.ports.blocked();
    if (blocked !== null) {
      this.finish('budget', blocked);
      return;
    }
    this.lastFrameAt = now;
    this.ports.video(frame);
  }

  private stillFrame(frame: SightFrame): void {
    const expected = this.expected;
    this.expected = null;
    if (expected?.source !== frame.source) {
      this.drop('unannounced_still', frame.source);
      return;
    }
    const blocked = this.ports.blocked();
    if (blocked !== null) {
      this.offState(frame.source, 'budget', blocked, expected.label);
      return;
    }
    const seen: Seen = { ...expected, picture: pictureOf(frame) };
    if (!this.looks.arrived(expected.lookId, seen)) {
      this.looks.showPerson(seen);
    }
  }

  private drop(why: string, source: SightSource): void {
    this.dropped += 1;
    if (this.dropped === 1) {
      this.ports.log.warn('voice.sight_frame_dropped', {
        callId: this.ports.callId,
        source,
        why,
      });
    }
  }

  private touch(source: SightSource): void {
    const wanted = SIGHT_SAMPLING[source].resolution;
    this.resolution = this.resolution === 'medium' || wanted === 'medium' ? 'medium' : 'low';
  }

  private retune(): void {
    this.ports.tune(
      this.resolution === null
        ? null
        : { mode: this.mode, resolution: this.resolution, memorySeconds: this.memorySeconds },
    );
  }
}
