import type { ClipboardClip } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';

export interface ClipboardPorts {
  readonly readLocal: () => Promise<string | null>;
  readonly writeLocal: (text: string) => Promise<void>;
  readonly sendRemote: (text: string) => Promise<void>;
}

export class ClipboardSync {
  private synced: string | null = null;
  private seen: string | null = null;
  private tail: Promise<void> = Promise.resolve();

  constructor(
    private readonly ports: ClipboardPorts,
    private readonly log: Logger,
  ) {}

  copied(text: string): Promise<void> {
    return this.queue('copied', async () => {
      this.seen = text;
      await this.send(text);
    });
  }

  localChanged(): Promise<void> {
    return this.queue('local_changed', async () => {
      const local = await this.ports.readLocal();
      if (local === null) return;
      this.seen = local;
      if (local !== '') await this.send(local);
    });
  }

  foreground(): Promise<void> {
    return this.queue('foreground', async () => {
      const local = await this.ports.readLocal();
      if (local === null) return;
      if (this.seen === null) {
        this.seen = local;
        return;
      }
      if (local === this.seen) return;
      if (local !== '') await this.send(local);
      this.seen = local;
    });
  }

  received(clip: ClipboardClip): Promise<void> {
    return this.queue('received', async () => {
      if (clip.text !== this.synced) await this.apply(clip.text);
    });
  }

  private async send(text: string): Promise<void> {
    if (text === this.synced) return;
    await this.ports.sendRemote(text);
    this.synced = text;
    this.log.info('clipboard.sent', { length: text.length });
  }

  private async apply(text: string): Promise<void> {
    await this.ports.writeLocal(text);
    this.synced = text;
    this.seen = text;
    this.log.info('clipboard.received', { length: text.length });
  }

  private queue(reason: string, task: () => Promise<void>): Promise<void> {
    const run = this.tail.then(task).catch((error: unknown) => {
      this.log.error('clipboard.sync_failed', error, { reason });
    });
    this.tail = run;
    return run;
  }
}
