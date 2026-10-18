import type { ClipboardClip } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';

export type SyncDecision = 'send' | 'apply' | 'none';

export function decideSync(
  local: string,
  remote: ClipboardClip | null,
  synced: string | null,
): SyncDecision {
  const localNew = local !== '' && local !== synced && local !== remote?.text;
  const remoteNew = remote !== null && remote.text !== synced && remote.text !== local;
  const firstContact = synced === null;
  if (localNew && !(firstContact && remoteNew)) return 'send';
  return remoteNew ? 'apply' : 'none';
}

export interface ClipboardPorts {
  readonly readLocal: () => Promise<string>;
  readonly writeLocal: (text: string) => Promise<void>;
  readonly readRemote: () => Promise<ClipboardClip | null>;
  readonly sendRemote: (text: string) => Promise<void>;
}

export class ClipboardSync {
  private synced: string | null = null;
  private tail: Promise<void> = Promise.resolve();

  constructor(
    private readonly ports: ClipboardPorts,
    private readonly log: Logger,
  ) {}

  copied(text: string): Promise<void> {
    return this.queue('copied', async () => {
      await this.send(text);
    });
  }

  localChanged(): Promise<void> {
    return this.queue('local_changed', async () => {
      const local = await this.ports.readLocal();
      if (local !== '' && local !== this.synced) await this.send(local);
    });
  }

  foreground(): Promise<void> {
    return this.queue('foreground', async () => {
      const local = await this.ports.readLocal();
      const remote = await this.ports.readRemote();
      const decision = decideSync(local, remote, this.synced);
      if (decision === 'send') await this.send(local);
      if (decision === 'apply' && remote !== null) await this.apply(remote.text);
      if (decision === 'none' && remote?.text === local) this.synced = local;
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
    this.log.info('clipboard.received', { length: text.length });
  }

  private queue(reason: string, task: () => Promise<void>): Promise<void> {
    const run = this.tail.then(task).catch((error: unknown) => {
      this.log.warn('clipboard.sync_failed', { reason, cause: String(error) });
    });
    this.tail = run;
    return run;
  }
}
