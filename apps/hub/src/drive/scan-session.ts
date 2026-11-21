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
    const begun = await port.begin({ scanId, rootId, paths });
    return new ScanSession(port, scanId, begun.previous, begun.scopes);
  }

  get scoped(): readonly string[] {
    if (this.scopes === null) throw new ScanStepError('A whole drive scan has no scopes.');
    return this.scopes;
  }

  apply(entries: readonly WalkEntry[]): Promise<void> {
    return this.port.apply({ scanId: this.scanId, entries: entries.map(scanEntryOf) });
  }

  async finish(
    unreadable: readonly string[],
    hash: (entry: WalkEntry) => Promise<string | null>,
  ): Promise<void> {
    const { scanId } = this;
    const wanted = await this.port.settle({ scanId, unreadable });
    const hashes: (string | null)[] = [];
    for (const entry of wanted) hashes.push(await hash(entry));
    await this.port.place({ scanId, hashes });
    while (await this.port.sweep({ scanId }));
  }

  end(): Promise<void> {
    return this.port.end({ scanId: this.scanId });
  }
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
