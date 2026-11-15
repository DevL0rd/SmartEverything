import {
  REPLY_META,
  decodeKeyed,
  encodeMeta,
  type ReplyMeta,
  type ReplyMetaInput,
  type RequestOpName,
} from '@smarteverything/domain/drive-mount';
import { z } from 'zod';
import { PosixError } from '../posix/errors';
import type { DriveSyncOpsRepository } from '../../store/repositories/drive-sync';

const MEMORY = z.strictObject({ action: z.string(), reply: z.string() });

export type MountOpMemory = Pick<DriveSyncOpsRepository, 'recall' | 'remember'>;

export function opKeyText(key: Uint8Array): string {
  return Buffer.from(key).toString('hex');
}

interface Pending {
  readonly action: string;
  readonly outcome: Promise<Uint8Array>;
}

export class MountDedupe {
  private readonly running = new Map<string, Pending>();

  constructor(private readonly memory: MountOpMemory) {}

  async once<Name extends RequestOpName>(
    placementId: string,
    op: { readonly name: Name; readonly key: Uint8Array },
    run: () => Promise<ReplyMetaInput<Name>>,
  ): Promise<ReplyMeta<Name>> {
    return decodeKeyed(REPLY_META, op.name, await this.onceEncoded(placementId, op, run));
  }

  async onceEncoded<Name extends RequestOpName>(
    placementId: string,
    op: { readonly name: Name; readonly key: Uint8Array },
    run: () => Promise<ReplyMetaInput<Name>>,
  ): Promise<Uint8Array> {
    const id = opKeyText(op.key);
    const slot = `${placementId}\0${id}`;
    const pending = this.running.get(slot);
    if (pending !== undefined) {
      return this.matching(pending, op.name, await pending.outcome);
    }
    const stored = this.memory.recall(placementId, id);
    if (stored !== undefined) {
      const memory = MEMORY.parse(stored);
      this.agree(memory.action, op.name);
      return new Uint8Array(Buffer.from(memory.reply, 'base64'));
    }
    const outcome = run().then((reply) => {
      const encoded = encodeMeta(REPLY_META[op.name], reply);
      this.memory.remember(placementId, id, {
        action: op.name,
        reply: Buffer.from(encoded).toString('base64'),
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
