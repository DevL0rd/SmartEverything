import type { DesktopOverlayHelper } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import type { KwinPort } from './kwin-overlay.js';

const log = new Logger('desktop.overlay');

export type OverlayHelper =
  | { readonly kind: 'idle' }
  | { readonly kind: 'ready' }
  | { readonly kind: 'absent' }
  | { readonly kind: 'failed'; readonly reason: string };

export function helperStatus(helper: OverlayHelper): DesktopOverlayHelper {
  return helper.kind === 'failed'
    ? { kind: 'failed', reason: helper.reason }
    : { kind: helper.kind === 'idle' ? 'unused' : helper.kind };
}

function failureText(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'KWin did not answer.';
}

export class HelperGate {
  #state: OverlayHelper = { kind: 'idle' };

  constructor(
    private readonly kwin: KwinPort | null,
    private readonly changed: (helper: OverlayHelper) => void,
  ) {}

  get state(): OverlayHelper {
    return this.#state;
  }

  get ready(): boolean {
    return this.#state.kind === 'ready';
  }

  lost(): void {
    if (this.#state.kind === 'ready') {
      this.#set({ kind: 'idle' });
    }
  }

  async prepare(starting: boolean): Promise<boolean> {
    const { kwin } = this;
    if (this.#state.kind === 'absent') {
      return true;
    }
    if (kwin === null) {
      this.#set({ kind: 'absent' });
      return true;
    }
    if (this.#state.kind === 'ready' && (!starting || (await this.#stillLoaded(kwin)))) {
      return true;
    }
    return this.#load(kwin);
  }

  async close(): Promise<void> {
    await this.kwin?.unload();
    if (this.#state.kind === 'ready') {
      this.#set({ kind: 'idle' });
    }
  }

  async #stillLoaded(kwin: KwinPort): Promise<boolean> {
    try {
      return await kwin.loaded();
    } catch (cause) {
      log.warn('overlay.helper_check_failed', { reason: failureText(cause) });
      return false;
    }
  }

  async #load(kwin: KwinPort): Promise<boolean> {
    try {
      const loaded = await kwin.load();
      this.#set({ kind: loaded === 'loaded' ? 'ready' : 'absent' });
      return true;
    } catch (cause) {
      log.warn('overlay.helper_unavailable', { reason: failureText(cause) });
      this.#set({ kind: 'failed', reason: failureText(cause) });
      return false;
    }
  }

  #set(helper: OverlayHelper): void {
    this.#state = helper;
    this.changed(helper);
  }
}
