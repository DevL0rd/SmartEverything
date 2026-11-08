import { background, Logger } from '@smarteverything/logging';
import { localLibrary } from './store';
import type { LocalMediaSource } from './types';

const log = new Logger('app.photos');

export interface LocalLibraryWatch {
  readonly stop: () => void;
  readonly refresh: () => void;
  readonly requestAccess: () => Promise<void>;
}

class LibraryWatch implements LocalLibraryWatch {
  private readonly controller = new AbortController();
  private running: Promise<void> | null = null;
  private again = false;
  private readonly off: () => void;

  constructor(private readonly source: LocalMediaSource) {
    this.off = source.onChange(this.refresh);
    this.refresh();
  }

  private failed = (error: unknown): void => {
    if (this.controller.signal.aborted) return;
    const message = error instanceof Error ? error.message : String(error);
    log.warn('photos.local_library.failed', { reason: message });
    localLibrary.update((state) => ({ ...state, state: 'error', error: message }));
  };

  private current(): boolean {
    return !this.controller.signal.aborted;
  }

  private async scan(): Promise<void> {
    const access = await this.source.access();
    if (this.controller.signal.aborted) return;
    if (access === 'none') {
      localLibrary.set({ state: 'denied', access, items: [], error: null });
      return;
    }
    const items = await this.source.list(this.controller.signal);
    if (this.current()) {
      localLibrary.set({
        state: 'ready',
        access,
        items,
        error: this.source.issues().join(' · ') || null,
      });
    }
  }

  readonly refresh = (): void => {
    if (this.controller.signal.aborted) return;
    if (this.running !== null) {
      this.again = true;
      return;
    }
    this.running = this.scan()
      .catch(this.failed)
      .finally(() => {
        this.running = null;
        if (this.again) {
          this.again = false;
          this.refresh();
        }
      });
    background(this.running, 'photos.local_library.refresh_failed');
  };

  readonly stop = (): void => {
    this.controller.abort();
    this.off();
  };

  readonly requestAccess = async (): Promise<void> => {
    try {
      await this.source.requestAccess();
      this.refresh();
    } catch (error) {
      this.failed(error);
    }
  };
}

export function watchLocalLibrary(source: LocalMediaSource): LocalLibraryWatch {
  return new LibraryWatch(source);
}
