import {
  REPLY_META,
  decodeKeyed,
  encodeMeta,
  type ReplyMeta,
  type ReplyMetaInput,
  type RequestOpName,
} from '@smarteverything/domain/drive-mount';
import type { Logger } from '@smarteverything/logging';
import { z } from 'zod';
import { PosixError } from '../posix/errors';
import { claimed } from '../replay-claims';
import type { DriveSyncOpsRepository } from '../../store/repositories/drive-sync';

const MEMORY = z.strictObject({ action: z.string(), reply: z.string().nullable() });

type Recalled = ReturnType<DriveSyncOpsRepository['recall']>;

export interface MountOpMemory {
  readonly recall: (placementId: string, opId: string) => Promise<Recalled>;
  readonly rememberAll: (
    entries: Parameters<DriveSyncOpsRepository['rememberAll']>[0],
  ) => Promise<void>;
}

export type Replay<Name extends RequestOpName> = () => Promise<ReplyMetaInput<Name> | null>;

export function opKeyText(key: Uint8Array): string {
  return Buffer.from(key).toString('hex');
}

interface Pending {
  readonly action: string;
  readonly outcome: Promise<Uint8Array>;
}

interface Remembered {
  readonly placementId: string;
  readonly opId: string;
  readonly result: { readonly action: string; readonly reply: string };
}

export class MountDedupe {
  private readonly running = new Map<string, Pending>();
  private readonly unsaved = new Map<string, Remembered>();
  private flushQueued = false;

  constructor(
    private readonly memory: MountOpMemory,
    private readonly log: Logger,
  ) {}

  async once<Name extends RequestOpName>(
    placementId: string,
    op: { readonly name: Name; readonly key: Uint8Array },
    run: () => Promise<ReplyMetaInput<Name>>,
    replay: Replay<Name>,
  ): Promise<ReplyMeta<Name>> {
    return decodeKeyed(REPLY_META, op.name, await this.onceEncoded(placementId, op, run, replay));
  }

  async onceEncoded<Name extends RequestOpName>(
    placementId: string,
    op: { readonly name: Name; readonly key: Uint8Array },
    run: () => Promise<ReplyMetaInput<Name>>,
    replay: Replay<Name>,
  ): Promise<Uint8Array> {
    const id = opKeyText(op.key);
    const slot = `${placementId}\0${id}`;
    const pending = this.running.get(slot);
    if (pending !== undefined) {
      return this.matching(pending, op.name, await pending.outcome);
    }
    const recalled = this.unsaved.has(slot) ? undefined : await this.memory.recall(placementId, id);
    const started = this.running.get(slot);
    if (started !== undefined) {
      return this.matching(started, op.name, await started.outcome);
    }
    const unsaved = this.unsaved.get(slot);
    const stored = unsaved === undefined ? recalled : unsaved.result;
    let replayed = false;
    if (stored !== undefined) {
      const memory = MEMORY.parse(stored);
      this.agree(memory.action, op.name);
      if (memory.reply !== null) return new Uint8Array(Buffer.from(memory.reply, 'base64'));
      replayed = true;
    }
    const claim = { placementId, opId: id, action: op.name };
    const outcome = claimed(claim, () => this.attempt(replayed, run, replay)).then((reply) => {
      const encoded = encodeMeta(REPLY_META[op.name], reply);
      this.remember(slot, {
        placementId,
        opId: id,
        result: { action: op.name, reply: Buffer.from(encoded).toString('base64') },
      });
      return encoded;
    });
    this.running.set(slot, { action: op.name, outcome });
    try {
      return await outcome;
    } finally {
      this.running.delete(slot);
    }
  }

  private async attempt<Name extends RequestOpName>(
    replayed: boolean,
    run: () => Promise<ReplyMetaInput<Name>>,
    replay: Replay<Name>,
  ): Promise<ReplyMetaInput<Name>> {
    if (!replayed) return run();
    const reply = await replay();
    if (reply !== null) {
      this.log.info('drive_mount.replay_rebuilt', {});
      return reply;
    }
    return run();
  }

  private remember(slot: string, entry: Remembered): void {
    this.unsaved.set(slot, entry);
    if (this.flushQueued) return;
    this.flushQueued = true;
    setImmediate(() => {
      this.flushQueued = false;
      const entries = [...this.unsaved.values()];
      this.unsaved.clear();
      this.memory.rememberAll(entries).catch((cause: unknown) => {
        this.log.error('drive_mount.replay_memory_failed', cause, { entries: entries.length });
      });
    });
  }

  private matching(pending: Pending, action: string, encoded: Uint8Array): Uint8Array {
    this.agree(pending.action, action);
    return encoded;
  }

  private agree(first: string, action: string): void {
    if (first !== action) {
      throw new PosixError('EINVAL', 'That operation key was already used for another operation.');
    }
  }
}
