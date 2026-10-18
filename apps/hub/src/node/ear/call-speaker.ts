import { background, messageOf, type Logger } from '@smarteverything/logging';
import type { SpeakerStream } from '../controls/linux/speaker-playback';
import { pcmOf } from './ear-audio';

export interface EarSpeaker {
  readonly open: () => Promise<SpeakerStream>;
}

export class CallSpeaker {
  private speaking: Promise<SpeakerStream | null> | null = null;

  constructor(
    private readonly speaker: EarSpeaker,
    private readonly log: Logger,
  ) {}

  open(): void {
    this.close();
    this.speaking = this.speaker.open().catch((cause: unknown) => {
      this.log.warn('computer_ear.speaker_unavailable', {
        reason: messageOf(cause),
        consequence: 'the AI cannot speak through this computer',
      });
      return null;
    });
  }

  write(base64: string): void {
    const pcm = pcmOf(base64);
    background(
      this.speaking?.then((speaker) => {
        speaker?.write(pcm);
      }),
      'computer_ear.speak_failed',
    );
  }

  close(): void {
    const speaking = this.speaking;
    this.speaking = null;
    background(
      speaking?.then((speaker) => {
        speaker?.end();
      }),
      'computer_ear.speaker_close_failed',
    );
  }
}
