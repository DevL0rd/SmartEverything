import { open } from 'node:fs/promises';
import { fsCode } from '../../fs-code';

interface Round {
  readonly paths: Set<string>;
  readonly promise: Promise<void>;
  readonly settle: { resolve: () => void; reject: (cause: unknown) => void };
}

export async function syncPath(path: string): Promise<void> {
  let handle;
  try {
    handle = await open(path, 'r');
  } catch (cause) {
    if (fsCode(cause) === 'ENOENT') return;
    throw cause;
  }
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function newRound(): Round {
  const settle = { resolve: (): void => undefined, reject: (_cause: unknown): void => undefined };
  const promise = new Promise<void>((resolve, reject) => {
    settle.resolve = resolve;
    settle.reject = reject;
  });
  return { paths: new Set<string>(), promise, settle };
}

export class GroupFsync {
  private pending: Round | null = null;

  constructor(
    private readonly journal: () => string | null,
    private readonly sync: (path: string) => Promise<void> = syncPath,
  ) {}

  request(paths: readonly string[]): Promise<void> {
    if (this.pending === null) {
      const round = newRound();
      this.pending = round;
      setImmediate(() => {
        this.pending = null;
        this.run(round).then(round.settle.resolve, round.settle.reject);
      });
    }
    for (const path of paths) this.pending.paths.add(path);
    return this.pending.promise;
  }

  private async run(round: Round): Promise<void> {
    const targets = new Set(round.paths);
    const journal = this.journal();
    if (journal !== null) targets.add(journal);
    await Promise.all([...targets].map((path) => this.sync(path)));
  }
}
