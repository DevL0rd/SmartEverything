import type { Dir } from 'node:fs';
import { opendir } from 'node:fs/promises';
import { ApiError, type AiReferenceSearch, type AiReferenceSummary } from '@smarteverything/domain';
import type { HarnessLocalFileSystem } from '@smarteverything/harness';
import type { ProjectPaths } from '../projects/paths';
import { projectStat } from '../projects/reads';
import type { ReferenceContext, ReferencePage, ReferenceSearchProgress } from './contracts';
import { ReferenceDirectories } from './directories';

const PAGE_ENTRY_BUDGET = 128;
const PAGE_TIME_MS = 40;
interface DirectoryCursor {
  readonly path: string;
  readonly version: string;
  readonly handle: Dir;
}
export class ManagedReferenceScan implements ReferenceSearchProgress {
  private readonly pending: ReferenceDirectories;
  private current: DirectoryCursor | undefined;
  constructor(
    private readonly paths: ProjectPaths,
    private readonly fs: HarnessLocalFileSystem,
    private context: ReferenceContext,
    private readonly request: AiReferenceSearch,
  ) {
    this.pending = new ReferenceDirectories(
      request.directory === undefined
        ? ['workspace', 'temporary', 'transfers']
        : [request.directory],
    );
  }
  async next(context: ReferenceContext, limit: number): Promise<ReferencePage> {
    this.context = context;
    const items: AiReferenceSummary[] = [];
    const until = performance.now() + PAGE_TIME_MS;
    let pageVisited = 0;
    while (items.length < limit && pageVisited < PAGE_ENTRY_BUDGET && performance.now() < until) {
      this.context.validate();
      const directory = await this.directory();
      if (directory === undefined) break;
      pageVisited += 1;
      const item = await this.consume(directory);
      if (item !== undefined) items.push(item);
    }
    await this.verifyDirectory();
    this.context.validate();
    return {
      items: items.sort((a, b) => a.subtitle.localeCompare(b.subtitle)),
      complete: this.complete(),
      incomplete: !this.complete(),
    };
  }
  private complete(): boolean {
    return this.current === undefined && !this.pending.pending;
  }
  private async consume(directory: DirectoryCursor): Promise<AiReferenceSummary | undefined> {
    const child = await directory.handle.read();
    if (child === null) {
      await this.closeDirectory();
      return undefined;
    }
    if (child.name === '.operations' || child.isSymbolicLink()) return undefined;
    const path = `${directory.path}/${child.name}`;
    const file = await projectStat(this.paths, this.fs, this.context.chat.id, path);
    if (file === null) return undefined;
    await this.enqueue(file);
    if (!path.toLocaleLowerCase().includes(this.request.query.toLocaleLowerCase()))
      return undefined;
    return {
      reference: {
        kind: 'managed_path',
        chat_id: this.context.chat.id,
        path,
        version: file.version,
        entry_kind: file.type,
      },
      label: child.name.slice(0, 300),
      subtitle: path,
    };
  }
  private async enqueue(file: { readonly path: string; readonly type: string }): Promise<void> {
    if (file.type === 'directory' && this.request.directory === undefined)
      await this.pending.add(file.path);
  }
  private async directory(): Promise<DirectoryCursor | undefined> {
    await this.verifyDirectory();
    if (this.current !== undefined) return this.current;
    const path = this.pending.take();
    if (path === undefined) return undefined;
    const file = await projectStat(this.paths, this.fs, this.context.chat.id, path);
    if (file?.type !== 'directory')
      throw new ApiError('conflict', 'The reference search directory is no longer available.');
    const handle = await opendir(await this.paths.resolve(this.context.chat.id, path));
    this.current = { path, version: file.version, handle };
    await this.verifyDirectory();
    return this.current;
  }
  private async verifyDirectory(): Promise<void> {
    if (this.current === undefined) return;
    const file = await projectStat(this.paths, this.fs, this.context.chat.id, this.current.path);
    if (file?.version !== this.current.version)
      throw new ApiError(
        'conflict',
        'The reference search directory changed; start a fresh search.',
      );
  }
  private async closeDirectory(): Promise<void> {
    const current = this.current;
    this.current = undefined;
    if (current !== undefined) await current.handle.close();
  }
  async close(): Promise<void> {
    try {
      await this.closeDirectory();
    } finally {
      await this.pending.close();
    }
  }
}
