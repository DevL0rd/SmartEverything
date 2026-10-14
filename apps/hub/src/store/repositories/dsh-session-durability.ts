import { z } from 'zod';
import type { StoreContext } from '../context';
import { DshSessionDurabilityError } from './dsh-session-errors';

const SYNCHRONOUS = z.strictObject({
  synchronous: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
});
const JOURNAL = z.strictObject({ journal_mode: z.string() });
const DURABLE_JOURNALS: ReadonlySet<string> = new Set(['wal', 'delete', 'truncate', 'persist']);
const barriers = new WeakSet<StoreContext>();

export function durableSessionWrite<T>(context: StoreContext, work: () => T): T {
  if (context.sql.inTransaction()) {
    if (barriers.has(context)) {
      const current = SYNCHRONOUS.parse(context.sql.database.prepare('pragma synchronous').get());
      if (current.synchronous < 2)
        throw new DshSessionDurabilityError('the admitted FULL durability barrier was changed');
      return work();
    }
    throw new DshSessionDurabilityError(
      'a FULL durability barrier cannot nest inside a store transaction',
    );
  }
  const journal = JOURNAL.parse(context.sql.database.prepare('pragma journal_mode').get());
  if (!DURABLE_JOURNALS.has(journal.journal_mode)) {
    throw new DshSessionDurabilityError('a disk-backed journal is required');
  }
  const previous = SYNCHRONOUS.parse(context.sql.database.prepare('pragma synchronous').get());
  context.sql.database.exec('pragma synchronous = full');
  try {
    return context.write(() => {
      barriers.add(context);
      try {
        return work();
      } finally {
        barriers.delete(context);
      }
    });
  } finally {
    context.sql.database.exec(`pragma synchronous = ${String(previous.synchronous)}`);
  }
}
