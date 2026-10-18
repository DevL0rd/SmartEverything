import type { CallVoice, VoiceSample } from '@smarteverything/domain';
import { ValueStore } from '../../../design/external-store';

export type VoicePreviewState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' | 'playing'; readonly voice: CallVoice }
  | { readonly kind: 'error'; readonly voice: CallVoice; readonly message: string };
export interface PreviewPlaybackEvents {
  readonly playing: () => void;
  readonly finished: () => void;
  readonly failed: (message: string) => void;
}
export interface PreviewPorts {
  readonly load: (voice: CallVoice, signal: AbortSignal) => Promise<VoiceSample>;
  readonly play: (sample: VoiceSample, events: PreviewPlaybackEvents) => () => void;
}
interface PreviewRun {
  readonly voice: CallVoice;
  readonly abort: AbortController;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'The voice sample could not play.';
}

export class VoicePreviewController {
  readonly state = new ValueStore<VoicePreviewState>({ kind: 'idle' });
  private run: PreviewRun | null = null;
  private release: (() => void) | null = null;
  stop(): void {
    this.run?.abort.abort();
    this.release?.();
    this.release = null;
    this.run = null;
    this.state.set({ kind: 'idle' });
  }
  toggle(voice: CallVoice, ports: PreviewPorts): void {
    const replaced = this.run?.voice === voice;
    this.stop();
    if (replaced) return;
    const run: PreviewRun = { voice, abort: new AbortController() };
    this.run = run;
    this.state.set({ kind: 'loading', voice });
    ports.load(voice, run.abort.signal).then(
      (sample) => {
        this.loaded(run, sample, ports);
      },
      (error: unknown) => {
        this.fail(run, messageOf(error));
      },
    );
  }
  private loaded(run: PreviewRun, sample: VoiceSample, ports: PreviewPorts): void {
    if (this.run !== run) return;
    try {
      this.release = ports.play(sample, {
        playing: (): void => {
          if (this.run === run) this.state.set({ kind: 'playing', voice: run.voice });
        },
        finished: (): void => {
          if (this.run === run) this.stop();
        },
        failed: (message): void => {
          this.fail(run, message);
        },
      });
    } catch (error) {
      this.fail(run, messageOf(error));
    }
  }
  private fail(run: PreviewRun, message: string): void {
    if (this.run !== run) return;
    this.stop();
    this.state.set({ kind: 'error', voice: run.voice, message });
  }
}
