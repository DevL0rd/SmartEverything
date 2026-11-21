import type { HarnessBuiltinSelection } from '@smarteverything/harness';
import { StoreNotFoundError } from '../store/context';
import type { StoreHost } from '../store/host/host';
import type { StoredExtension } from '../store/repositories/harness-extensions';

export class HarnessExtensionRowsNotLoadedError extends Error {
  override readonly name = 'HarnessExtensionRowsNotLoadedError';

  constructor() {
    super('The installed skills and plugins are read before the harness started.');
  }
}

type Builtins = Readonly<Record<string, HarnessBuiltinSelection>>;

interface Loaded {
  readonly rows: Map<string, StoredExtension>;
  builtins: Builtins;
}

function ordered(a: StoredExtension, b: StoredExtension): number {
  const left = `${a.kind}\n${a.name}`;
  const right = `${b.kind}\n${b.name}`;
  return left < right ? -1 : left > right ? 1 : 0;
}

export class HarnessExtensionRows {
  private loaded: Loaded | null = null;

  constructor(private readonly host: Pick<StoreHost, 'call'>) {}

  async load(): Promise<void> {
    const [rows, builtins] = await Promise.all([
      this.host.call('harnessExtensions', 'list'),
      this.host.call('harnessExtensions', 'builtins'),
    ]);
    this.loaded = { rows: new Map(rows.map((row) => [row.id, row])), builtins };
  }

  list(): StoredExtension[] {
    return [...this.state().rows.values()].sort(ordered);
  }

  find(id: string): StoredExtension | undefined {
    return this.state().rows.get(id);
  }

  builtins(): Builtins {
    return this.state().builtins;
  }

  async keep(row: StoredExtension): Promise<void> {
    await this.host.call('harnessExtensions', 'keep', row);
    const stored = await this.host.call('harnessExtensions', 'find', row.id);
    if (stored === undefined) throw new StoreNotFoundError('harness extension', row.id);
    this.state().rows.set(stored.id, stored);
  }

  async remove(id: string): Promise<void> {
    await this.host.call('harnessExtensions', 'remove', id);
    this.state().rows.delete(id);
  }

  async keepBuiltin(id: string, selection: HarnessBuiltinSelection): Promise<void> {
    await this.host.call('harnessExtensions', 'keepBuiltin', id, selection);
    this.state().builtins = await this.host.call('harnessExtensions', 'builtins');
  }

  private state(): Loaded {
    if (this.loaded === null) throw new HarnessExtensionRowsNotLoadedError();
    return this.loaded;
  }
}
