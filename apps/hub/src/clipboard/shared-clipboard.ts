import {
  ApiError,
  CLIENT_PREFS,
  type ClipboardClip,
  type ClipboardNotice,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { Store } from '../store/store';

export interface ClipboardDeps {
  readonly store: Store;
  readonly now: () => Date;
  readonly log: Logger;
  readonly announce: (notice: ClipboardNotice, profileId: string) => void;
}

export interface ClipboardCaller {
  readonly clientId: string;
  readonly profileId: string;
}

export class SharedClipboard {
  private readonly clips = new Map<string, ClipboardClip>();

  constructor(private readonly deps: ClipboardDeps) {}

  read(caller: ClipboardCaller): ClipboardClip | null {
    this.assertEnabled(caller);
    return this.clips.get(caller.profileId) ?? null;
  }

  write(caller: ClipboardCaller, text: string): ClipboardClip {
    this.assertEnabled(caller);
    const clip: ClipboardClip = {
      text,
      from: caller.clientId,
      at: this.deps.now().toISOString(),
    };
    this.clips.set(caller.profileId, clip);
    this.deps.announce({ type: 'clipboard', ...clip }, caller.profileId);
    this.deps.log.info('clipboard.shared', {
      profileId: caller.profileId,
      clientId: caller.clientId,
      length: text.length,
    });
    return clip;
  }

  private assertEnabled(caller: ClipboardCaller): void {
    const read = this.deps.store.personal.pref(CLIENT_PREFS.shared_clipboard, caller);
    if (read.status === 'invalid') {
      throw new ApiError('conflict', read.reason);
    }
    if (!read.value.enabled) {
      throw new ApiError('conflict', 'The shared clipboard is turned off for this person.');
    }
  }
}
