import { Logger } from '@smarteverything/logging';
import { openMicrophone, startCapture, type Capture } from '../../../../talk';
import {
  gateSettingsOf,
  microphoneSettingsOf,
  sameGate,
  sameMicrophone,
  type MicrophoneSettings,
} from './audio-settings';
import {
  openSpeechGate,
  type HeardFrame,
  type SpeechGateSink,
  type WebSpeechGate,
} from './speech-gate';
import type { CallAudio } from '@smarteverything/domain';

const log = new Logger('app.assistant-call');

export interface MicrophoneHandlers {
  readonly sink: SpeechGateSink;
  readonly assistantAudible: () => boolean;
  readonly muted: () => boolean;
  readonly level?: (level: number) => void;
  readonly failure: (problem: string, error: unknown) => void;
}

export class MicrophoneChain {
  private stream: MediaStream | null = null;
  private capture: Capture | null = null;
  private gate: WebSpeechGate | null = null;
  private settings: MicrophoneSettings;
  private opened = false;

  constructor(
    private audio: CallAudio,
    private readonly handlers: MicrophoneHandlers,
  ) {
    this.settings = microphoneSettingsOf(audio);
  }

  get gateReady(): WebSpeechGate | null {
    return this.gate;
  }

  async open(): Promise<MediaStream> {
    const stream = await openMicrophone(this.settings);
    this.stream = stream;
    this.opened = true;
    this.capture = this.capturing(stream);
    return stream;
  }

  async listen(stream: MediaStream): Promise<void> {
    const gate = await this.gating(stream);
    if (this.opened) {
      this.gate = gate;
    } else {
      await gate.stop();
    }
  }

  async apply(next: CallAudio): Promise<void> {
    const previous = this.audio;
    this.audio = next;
    if (!this.opened) {
      this.settings = microphoneSettingsOf(next);
      return;
    }
    if (!sameGate(gateSettingsOf(previous), gateSettingsOf(next))) {
      this.gate?.retune(gateSettingsOf(next));
    }
    const wanted = microphoneSettingsOf(next);
    if (sameMicrophone(this.settings, wanted)) {
      return;
    }
    await (wanted.deviceId === this.settings.deviceId ? this.constrain(wanted) : this.swap(wanted));
    this.settings = wanted;
  }

  async deviceListChanged(inputs: readonly string[]): Promise<void> {
    const preferred = this.settings.deviceId;
    const current = this.stream?.getAudioTracks()[0]?.getSettings().deviceId;
    if (this.opened && preferred !== null && inputs.includes(preferred) && current !== preferred) {
      await this.swap(this.settings);
    }
  }

  stop(): Promise<void> {
    this.opened = false;
    this.capture?.stop();
    this.capture = null;
    this.stream = null;
    const gate = this.gate;
    this.gate = null;
    return gate === null ? Promise.resolve() : gate.stop();
  }

  observe(listener: (frame: HeardFrame) => void): (() => void) | null {
    return this.gate?.observe(listener) ?? null;
  }

  private capturing(stream: MediaStream): Capture {
    stream.getAudioTracks()[0]?.addEventListener('ended', () => {
      this.lost(stream);
    });
    return startCapture(stream, {
      onPacket: (packet) => {
        if (!this.handlers.muted()) {
          this.gate?.packet(packet);
        }
      },
      onLevel: (level) => {
        this.handlers.level?.(level);
      },
      onFailure: (error) => {
        this.handlers.failure('Microphone stopped working', error);
      },
    });
  }

  private gating(stream: MediaStream): Promise<WebSpeechGate> {
    const { sink } = this.handlers;
    return openSpeechGate(stream, sink, this.handlers.assistantAudible, gateSettingsOf(this.audio));
  }

  private lost(stream: MediaStream): void {
    if (!this.opened || stream !== this.stream) {
      return;
    }
    this.swap(this.settings).catch((error: unknown) => {
      this.handlers.failure('Microphone stopped working', error);
    });
  }

  private async constrain(wanted: MicrophoneSettings): Promise<void> {
    const [track] = this.stream?.getAudioTracks() ?? [];
    if (track === undefined) {
      return;
    }
    await track.applyConstraints({
      noiseSuppression: wanted.noiseSuppression,
      autoGainControl: wanted.autoGainControl,
    });
    const now = track.getSettings();
    if (
      now.noiseSuppression !== wanted.noiseSuppression ||
      now.autoGainControl !== wanted.autoGainControl
    ) {
      log.info('call.microphone_reopened', {
        reason: 'the browser kept the old processing settings',
      });
      await this.swap(wanted);
    }
  }

  private async swap(wanted: MicrophoneSettings): Promise<void> {
    const next = await openMicrophone(wanted);
    const previous = this.capture;
    this.stream = next;
    this.capture = this.capturing(next);
    await this.gate?.attach(next);
    previous?.stop();
  }
}
