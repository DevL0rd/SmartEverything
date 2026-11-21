import { randomUUID } from 'node:crypto';
import { scanEntryOf } from './file-type';
import type { ScanPort } from './scan-port';
import { ScanStepError } from './scanner-drafts';
import type { WalkEntry } from './scanner-walk';

export class ScanSession {
  private constructor(
    private readonly port: ScanPort,
    private readonly scanId: string,
    readonly previous: number,
    readonly scopes: readonly string[] | null,
  ) {}

  static async begin(
    port: ScanPort,
    rootId: string,
    paths: readonly string[] | null,
  ): Promise<ScanSession> {
    const scanId = randomUUID();
    const { scopes } = await port.begin({ scanId, rootId, paths });
    try {
      return new ScanSession(port, scanId, await loaded(port, scanId), scopes);
    } catch (cause) {
      await port.end({ scanId });
      throw cause;
    }
  }

  get scoped(): readonly string[] {
    if (this.scopes === null) throw new ScanStepError('A whole drive scan has no scopes.');
    return this.scopes;
  }

  async apply(entries: readonly WalkEntry[]): Promise<void> {
    const { scanId } = this;
    let rest = entries.map(scanEntryOf);
    while (rest.length > 0) rest = rest.slice(await this.port.apply({ scanId, entries: rest }));
  }

  async finish(
    unreadable: readonly string[],
    hash: (entry: WalkEntry) => Promise<string | null>,
  ): Promise<void> {
    const { scanId } = this;
    let settled = await this.port.settle({ scanId, unreadable });
    while (!settled.done) settled = await this.port.settle({ scanId, unreadable });
    const hashes: (string | null)[] = [];
    for (const entry of settled.wanted) hashes.push(await hash(entry));
    await this.port.place({ scanId, hashes });
    while (await this.port.commit({ scanId }));
  }

  end(): Promise<void> {
    return this.port.end({ scanId: this.scanId });
  }
}

async function loaded(port: ScanPort, scanId: string): Promise<number> {
  let step = await port.load({ scanId });
  while (step.more) step = await port.load({ scanId });
  return step.previous;
}

export async function withScan<T>(
  port: ScanPort,
  rootId: string,
  paths: readonly string[] | null,
  work: (session: ScanSession) => Promise<T>,
): Promise<T> {
  const session = await ScanSession.begin(port, rootId, paths);
  try {
    return await work(session);
  } finally {
    await session.end();
  }
}
