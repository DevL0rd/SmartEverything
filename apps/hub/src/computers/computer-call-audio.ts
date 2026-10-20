import type { ListeningHubMessage } from '@smarteverything/domain';
import { concat, opusCodec } from '../assistant-voice/audio';
import { HANDOFF_LIMIT_MS } from '../wake-name/handoff-limit';
import type { OpenMicrophone } from '../talk/camera-microphone';
import { base64OfPcm } from './ear-pcm';

const SAMPLES_PER_MS = 16;

export type EarSend = (message: ListeningHubMessage) => void;

export interface ComputerMicHandlers {
  readonly pcm: (pcm16k: Int16Array) => void;
  readonly ended: (failure: string | null) => void;
}

export interface ComputerSpeaker {
  readonly packet: (packet: Uint8Array) => void;
  readonly end: () => void;
}

export interface ComputerAudio {
  readonly microphone: (computerId: string, handlers: ComputerMicHandlers) => OpenMicrophone | null;
  readonly speaker: (computerId: string) => ComputerSpeaker | null;
}

interface Call {
  readonly send: EarSend;
  held: Int16Array[];
  heldMs: number;
  handlers: ComputerMicHandlers | null;
}

export interface ComputerCallAudioOptions {
  readonly sendOf: (computerId: string) => EarSend | null;
  readonly changed: (computerId: string, active: boolean) => void;
}

export class ComputerCallAudio implements ComputerAudio {
  private readonly calls = new Map<string, Call>();

  constructor(private readonly options: ComputerCallAudioOptions) {}

  active(computerId: string): boolean {
    return this.calls.has(computerId);
  }

  begin(computerId: string, preroll: Int16Array): (() => Int16Array) | null {
    const call = this.open(computerId);
    if (call === null) {
      return null;
    }
    call.held.push(preroll);
    call.heldMs += preroll.length / SAMPLES_PER_MS;
    return (): Int16Array => {
      const words = concat(call.held);
      call.held = [];
      call.heldMs = 0;
      return words;
    };
  }

  readonly microphone = (
    computerId: string,
    handlers: ComputerMicHandlers,
  ): OpenMicrophone | null => {
    const call = this.calls.get(computerId) ?? this.open(computerId);
    if (call === null) {
      return null;
    }
    if (call.handlers !== null) {
      return null;
    }
    call.handlers = handlers;
    const waiting = concat(call.held);
    call.held = [];
    call.heldMs = 0;
    if (waiting.length > 0) {
      handlers.pcm(waiting);
    }
    return {
      stop: (): void => {
        this.end(computerId);
      },
    };
  };

  readonly speaker = (computerId: string): ComputerSpeaker | null => {
    const call = this.calls.get(computerId) ?? this.open(computerId);
    if (call === null) {
      return null;
    }
    const codec = opusCodec();
    return {
      packet: (packet): void => {
        call.send({ kind: 'speak', pcm: base64OfPcm(codec.decode(packet)) });
      },
      end: (): void => {
        codec.free();
      },
    };
  };

  heard(computerId: string, pcm: Int16Array): void {
    const call = this.calls.get(computerId);
    if (call === undefined) {
      return;
    }
    if (call.handlers !== null) {
      call.handlers.pcm(pcm);
      return;
    }
    call.held.push(pcm);
    call.heldMs += pcm.length / SAMPLES_PER_MS;
    if (call.heldMs > HANDOFF_LIMIT_MS) {
      this.end(computerId);
    }
  }

  lost(computerId: string, failure: string): void {
    const call = this.calls.get(computerId);
    if (call === undefined) {
      return;
    }
    this.calls.delete(computerId);
    this.options.changed(computerId, false);
    call.handlers?.ended(failure);
  }

  end(computerId: string): void {
    const call = this.calls.get(computerId);
    if (call === undefined) {
      return;
    }
    this.calls.delete(computerId);
    call.send({ kind: 'call', active: false });
    this.options.changed(computerId, false);
  }

  private open(computerId: string): Call | null {
    const send = this.options.sendOf(computerId);
    if (send === null || this.calls.has(computerId)) {
      return null;
    }
    const call: Call = { send, held: [], heldMs: 0, handlers: null };
    this.calls.set(computerId, call);
    send({ kind: 'call', active: true });
    this.options.changed(computerId, true);
    return call;
  }
}
