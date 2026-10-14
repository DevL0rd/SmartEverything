import {
  VOICE_PREVIEW_SECONDS,
  VOICE_PREVIEW_TIMEOUT_MS,
  type VoicePreview,
  type VoicePreviewRequest,
} from '@smarteverything/domain';
import { ValueStore } from '../../../design/external-store';

export type VoicePreviewState =
  | { readonly kind: 'idle' }
  | {
      readonly kind: 'loading' | 'playing';
      readonly voice: VoicePreviewRequest['voice'];
      readonly requestId: string;
    }
  | {
      readonly kind: 'error';
      readonly voice: VoicePreviewRequest['voice'];
      readonly message: string;
    };
export interface PreviewPorts {
  readonly load: (request: VoicePreviewRequest) => Promise<VoicePreview>;
  readonly cancel: (request: VoicePreviewRequest) => void;
  readonly play: (sample: VoicePreview, events: PreviewPlaybackEvents) => () => void;
}
export interface PreviewPlaybackEvents {
  readonly playing: () => void;
  readonly finished: () => void;
  readonly failed: (message: string) => void;
}
interface PreviewRun {
  readonly request: VoicePreviewRequest;
  readonly ports: PreviewPorts;
  release: (() => void) | null;
  timer: ReturnType<typeof setTimeout>;
}
const active: { controller: VoicePreviewController | null } = { controller: null };
export class VoicePreviewController {
  readonly state = new ValueStore<VoicePreviewState>({ kind: 'idle' });
  private run: PreviewRun | null = null;
  stop(): void {
    const run = this.run;
    this.run = null;
    if (active.controller === this) active.controller = null;
    if (run !== null) {
      clearTimeout(run.timer);
      run.ports.cancel(run.request);
      run.release?.();
    }
    this.state.set({ kind: 'idle' });
  }
  toggle(request: VoicePreviewRequest, ports: PreviewPorts): void {
    if (this.run?.request.voice === request.voice) {
      this.stop();
      return;
    }
    active.controller?.stop();
    this.stop();
    active.controller = this;
    const run: PreviewRun = {
      request,
      ports,
      release: null,
      timer: setTimeout(() => {
        this.fail(request.requestId, 'The voice sample did not load in time. Try again.');
      }, VOICE_PREVIEW_TIMEOUT_MS),
    };
    this.run = run;
    this.state.set({ kind: 'loading', voice: request.voice, requestId: request.requestId });
    void ports.load(request).then(
      (sample) => {
        this.loaded(run, sample);
      },
      (error: unknown) => {
        this.fail(
          request.requestId,
          error instanceof Error ? error.message : 'The voice sample could not load.',
        );
      },
    );
  }
  private loaded(run: PreviewRun, sample: VoicePreview): void {
    if (this.run !== run) return;
    if (sample.requestId !== run.request.requestId || sample.voice !== run.request.voice) {
      this.fail(run.request.requestId, 'The hub returned a sample for a different voice.');
      return;
    }
    clearTimeout(run.timer);
    this.run.timer = setTimeout(
      () => {
        this.fail(run.request.requestId, 'The voice sample could not finish playing. Try again.');
      },
      (VOICE_PREVIEW_SECONDS + 3) * 1000,
    );
    try {
      const release = run.ports.play(sample, {
        playing: (): void => {
          if (this.run === run)
            this.state.set({
              kind: 'playing',
              voice: run.request.voice,
              requestId: run.request.requestId,
            });
        },
        finished: (): void => {
          if (this.run === run) this.stop();
        },
        failed: (message): void => {
          this.fail(run.request.requestId, message);
        },
      });
      if (this.run === run) this.run.release = release;
      else release();
    } catch (error) {
      this.fail(
        run.request.requestId,
        error instanceof Error ? error.message : 'This device could not play the voice sample.',
      );
    }
  }
  private fail(requestId: string, message: string): void {
    const run = this.run;
    if (run?.request.requestId !== requestId) return;
    this.stop();
    this.state.set({ kind: 'error', voice: run.request.voice, message });
  }
}
