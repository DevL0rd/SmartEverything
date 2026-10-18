import {
  voiceLevelByte,
  type CallPhase,
  type VoiceActivityNotice,
  type VoiceCaptionNotice,
  type VoiceLevelsNotice,
} from '@smarteverything/domain';

export const LEVEL_INTERVAL_MS = 50;
const STALE_MS = 150;
const FULL_SCALE = 32768;
const GAIN = 4;

interface VoiceDevice {
  readonly kind: 'computer' | 'phone';
  readonly id: string;
}

export interface VoiceCall {
  readonly callId: string;
  readonly device: VoiceDevice;
  readonly profileId: string | null;
}

export interface VoiceWatcher {
  readonly key: string;
  readonly owner: boolean;
  readonly profileId: string;
  readonly send: (notice: VoiceLevelsNotice | VoiceCaptionNotice) => void;
}

export interface VoiceActivityPorts {
  readonly announce: (notice: VoiceActivityNotice, profileId: string | null) => void;
  readonly decode: (packet: Uint8Array) => Int16Array;
  readonly now: () => number;
}

export interface VoiceCallTap {
  readonly phase: (phase: CallPhase) => void;
  readonly muted: (muted: boolean) => void;
  readonly caption: (who: VoiceCaptionNotice['who'], text: string) => void;
  readonly heard: (pcm: Int16Array) => void;
  readonly spoke: (packet: Uint8Array) => void;
  readonly end: () => void;
}

export function pcmLevel(pcm: Int16Array): number {
  if (pcm.length === 0) {
    return 0;
  }
  let sum = 0;
  for (const sample of pcm) {
    sum += sample * sample;
  }
  return Math.min(1, (Math.sqrt(sum / pcm.length) / FULL_SCALE) * GAIN);
}

class Live {
  phase: CallPhase = 'idle';
  muted = false;
  input = 0;
  output = 0;
  outputAt = Number.NEGATIVE_INFINITY;
  inputAt = Number.NEGATIVE_INFINITY;
  phaseAt = Number.NEGATIVE_INFINITY;
  sentAt = Number.NEGATIVE_INFINITY;
  sent = '0:0';

  constructor(readonly call: VoiceCall) {}

  hearable(now: number): boolean {
    return now - this.inputAt >= LEVEL_INTERVAL_MS;
  }

  speakable(now: number): boolean {
    return now - this.outputAt >= LEVEL_INTERVAL_MS;
  }

  levelsAt(now: number): { readonly input: number; readonly output: number } {
    return { input: this.input, output: now - this.outputAt > STALE_MS ? 0 : this.output };
  }

  settle(phase: CallPhase, at: number): boolean {
    if (this.phase === phase) {
      return false;
    }
    this.phase = phase;
    this.phaseAt = at;
    if (phase === 'ended') {
      this.silence();
    } else if (phase !== 'speaking') {
      this.output = 0;
    }
    return true;
  }

  mute(muted: boolean): boolean {
    const changed = this.muted !== muted;
    this.muted = muted;
    return changed;
  }

  hear(level: number, now: number): void {
    this.input = level;
    this.inputAt = now;
  }

  speak(level: number, now: number): void {
    this.output = level;
    this.outputAt = now;
  }

  silence(): void {
    this.input = 0;
    this.output = 0;
  }

  mark(signature: string, now: number): void {
    this.sent = signature;
    this.sentAt = now;
  }
}

function mayWatch(watcher: VoiceWatcher, call: VoiceCall): boolean {
  return watcher.owner || (call.profileId !== null && call.profileId === watcher.profileId);
}

export class VoiceActivity {
  readonly #calls = new Map<string, Live>();
  readonly #watching = new Map<string, string>();
  readonly #watchersOf = new Map<string, Map<string, VoiceWatcher>>();

  constructor(private readonly ports: VoiceActivityPorts) {}

  begin(call: VoiceCall): VoiceCallTap {
    const live = new Live(call);
    this.#calls.set(call.callId, live);
    return {
      phase: (phase): void => {
        this.#phase(live, phase);
      },
      muted: (muted): void => {
        this.#mute(live, muted);
      },
      caption: (who, text): void => {
        this.#caption(live, who, text);
      },
      heard: (pcm): void => {
        this.#heard(live, pcm);
      },
      spoke: (packet): void => {
        this.#spoke(live, packet);
      },
      end: (): void => {
        this.#end(live);
      },
    };
  }

  watch(watcher: VoiceWatcher, callId: string | null): boolean {
    this.release(watcher.key);
    if (callId === null) {
      return true;
    }
    const live = this.#calls.get(callId);
    if (live === undefined || !mayWatch(watcher, live.call)) {
      return false;
    }
    this.#watching.set(watcher.key, callId);
    const watchers = this.#watchersOf.get(callId) ?? new Map<string, VoiceWatcher>();
    watchers.set(watcher.key, watcher);
    this.#watchersOf.set(callId, watchers);
    return true;
  }

  release(key: string): void {
    const callId = this.#watching.get(key);
    if (callId === undefined) {
      return;
    }
    this.#watching.delete(key);
    const watchers = this.#watchersOf.get(callId);
    watchers?.delete(key);
    if (watchers?.size === 0) {
      this.#watchersOf.delete(callId);
    }
  }

  watched(callId: string): boolean {
    return this.#watchersOf.has(callId);
  }

  active(watcher: VoiceWatcher): VoiceActivityNotice[] {
    return [...this.#calls.values()]
      .filter((live) => live.phase !== 'ended' && mayWatch(watcher, live.call))
      .map((live) => this.#noticeOf(live));
  }

  #phase(live: Live, phase: CallPhase): void {
    if (live.settle(phase, this.ports.now())) {
      this.#announce(live);
      this.#levels(live, true);
    }
  }

  #mute(live: Live, muted: boolean): void {
    if (live.mute(muted)) {
      this.#announce(live);
    }
  }

  #caption(live: Live, who: VoiceCaptionNotice['who'], text: string): void {
    const notice: VoiceCaptionNotice = {
      type: 'voice_caption',
      call_id: live.call.callId,
      who,
      text,
    };
    this.#watchersOf.get(live.call.callId)?.forEach((watcher) => {
      watcher.send(notice);
    });
  }

  #noticeOf(live: Live): VoiceActivityNotice {
    return {
      type: 'voice_activity',
      device: live.call.device,
      call_id: live.call.callId,
      phase: live.phase,
      muted: live.muted,
      superseded_by: null,
      at: live.phaseAt,
    };
  }

  #announce(live: Live): void {
    this.ports.announce(this.#noticeOf(live), live.call.profileId);
  }

  #heard(live: Live, pcm: Int16Array): void {
    const now = this.ports.now();
    if (this.watched(live.call.callId) && live.hearable(now)) {
      live.hear(pcmLevel(pcm), now);
      this.#levels(live, false);
    }
  }

  #spoke(live: Live, packet: Uint8Array): void {
    const now = this.ports.now();
    if (this.watched(live.call.callId) && live.speakable(now)) {
      live.speak(pcmLevel(this.ports.decode(packet)), now);
      this.#levels(live, false);
    }
  }

  #levels(live: Live, force: boolean): void {
    const now = this.ports.now();
    if (!force && now - live.sentAt < LEVEL_INTERVAL_MS) {
      return;
    }
    const levels = live.levelsAt(now);
    const notice: VoiceLevelsNotice = {
      type: 'voice_levels',
      call_id: live.call.callId,
      in: voiceLevelByte(levels.input),
      out: voiceLevelByte(levels.output),
    };
    const signature = `${String(notice.in)}:${String(notice.out)}`;
    if (signature === live.sent && notice.in === 0 && notice.out === 0) {
      return;
    }
    live.mark(signature, now);
    this.#watchersOf.get(live.call.callId)?.forEach((watcher) => {
      watcher.send(notice);
    });
  }

  #end(live: Live): void {
    if (this.#calls.get(live.call.callId) !== live) {
      return;
    }
    this.#phase(live, 'ended');
    this.#calls.delete(live.call.callId);
    [...(this.#watchersOf.get(live.call.callId)?.keys() ?? [])].forEach((key) => {
      this.#watching.delete(key);
    });
    this.#watchersOf.delete(live.call.callId);
  }
}
