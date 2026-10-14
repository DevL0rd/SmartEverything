import type { Context } from '@deepseek-ai/cordis';
import { opendir, lstat } from 'node:fs/promises';
import type { Dir } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import type {
  AiHarnessStorageBinding,
  AiReference,
  AiReferenceSearch,
  AiReferenceSummary,
} from '@smarteverything/domain';
import { z } from 'zod';
import { HarnessRuntimeError } from '../host/errors';
import { NativeReferenceDirectories } from './directories';
import { referenceHash } from './identity';

const ROOT = z.strictObject({ path: z.string(), target_key: z.string(), version: z.string() });
const PAGE_ENTRIES = 128;
const PAGE_MS = 40;
type Binding = Extract<AiHarnessStorageBinding, { kind: 'device' }>;
export interface NativeReferencePage {
  readonly items: readonly AiReferenceSummary[];
  readonly complete: boolean;
  readonly incomplete: boolean;
}
export async function deviceRoot(ctx: Context, binding: Binding): Promise<string> {
  await safeDevicePath(binding.path, binding.path);
  const target = await ctx.fs.resolve(binding.path);
  const info = await ctx.fs.stat(target);
  if (info?.type !== 'directory')
    throw new HarnessRuntimeError(
      'directory_unavailable',
      'The explicit device workspace is unavailable.',
    );
  return JSON.stringify({
    path: resolve(binding.path),
    target_key: target.targetKey,
    version: info.version,
  });
}
export async function resolveDeviceReference(
  ctx: Context,
  binding: Binding,
  reference: Extract<AiReference, { kind: 'device_path' }>,
  signal?: AbortSignal,
): Promise<void> {
  if (
    JSON.stringify(binding.target) !== JSON.stringify(reference.target) ||
    (await deviceRoot(ctx, binding)) !== reference.workspace_root
  )
    throw new HarnessRuntimeError(
      'directory_unavailable',
      'The referenced device or workspace identity changed.',
    );
  const root = ROOT.parse(JSON.parse(reference.workspace_root));
  const path = join(root.path, reference.path);
  await safeDevicePath(root.path, path);
  const target = await ctx.fs.resolve(path, signal === undefined ? undefined : { signal });
  const parent = await ctx.fs.resolve(root.path, signal === undefined ? undefined : { signal });
  const info = await ctx.fs.stat(target, signal);
  if (
    !ctx.fs.contains(parent, target) ||
    info?.type !== reference.entry_kind ||
    info.version !== reference.version
  )
    throw new HarnessRuntimeError(
      'directory_unavailable',
      'The referenced device entry changed or escaped its workspace.',
    );
}
async function safeDevicePath(root: string, path: string): Promise<void> {
  const delta = relative(resolve(root), resolve(path));
  if (delta.startsWith('..') || isAbsolute(delta))
    throw new HarnessRuntimeError(
      'directory_unavailable',
      'Device references must stay in the explicit workspace.',
    );
  const parts = resolve(path).split('/').filter(Boolean);
  let current = '/';
  for (const part of parts) {
    current = join(current, part);
    const info = await lstat(current);
    if (
      info.isSymbolicLink() ||
      (!info.isDirectory() && !info.isFile()) ||
      (info.isFile() && info.nlink !== 1)
    )
      throw new HarnessRuntimeError(
        'directory_unavailable',
        'Device references require plain directories and private regular files.',
      );
  }
}
export class NativeDeviceReferenceScan {
  private directory:
    { readonly handle: Dir; readonly path: string; readonly version: string } | undefined;
  private closed: Promise<void> | undefined;
  private constructor(
    private readonly ctx: Context,
    private readonly binding: Binding,
    private readonly search: { readonly root: string; readonly request: AiReferenceSearch },
    private readonly directories: NativeReferenceDirectories,
  ) {}
  static async open(
    ctx: Context,
    binding: Binding,
    request: AiReferenceSearch,
  ): Promise<NativeDeviceReferenceScan> {
    const root = await deviceRoot(ctx, binding);
    const container = request.container;
    if (container !== undefined) {
      if (container.kind !== 'device_path')
        throw new HarnessRuntimeError(
          'directory_unavailable',
          'This container is not on the selected device.',
        );
      await resolveDeviceReference(ctx, binding, container);
    }
    const directories = await NativeReferenceDirectories.open();
    directories.add(container === undefined ? binding.path : join(binding.path, container.path));
    return new NativeDeviceReferenceScan(ctx, binding, { root, request }, directories);
  }
  async next(limit: number, signal?: AbortSignal): Promise<NativeReferencePage> {
    if (this.closed !== undefined)
      throw new HarnessRuntimeError('directory_unavailable', 'Device reference search is closed.');
    if ((await deviceRoot(this.ctx, this.binding)) !== this.search.root)
      throw new HarnessRuntimeError(
        'directory_unavailable',
        'Device workspace changed while searching.',
      );
    const items: AiReferenceSummary[] = [];
    const deadline = performance.now() + PAGE_MS;
    for (
      let examined = 0;
      examined < PAGE_ENTRIES && performance.now() < deadline && items.length < limit;
      examined += 1
    ) {
      signal?.throwIfAborted();
      if (!(await this.openDirectory(signal))) return { items, complete: true, incomplete: false };
      const directory = this.directory;
      if (directory === undefined)
        throw new HarnessRuntimeError(
          'directory_unavailable',
          'Device directory iterator is absent.',
        );
      const item = await this.entry(directory, signal);
      if (item !== undefined && matchesDeviceQuery(item, this.search.request.query))
        items.push(item);
    }
    return { items, complete: false, incomplete: true };
  }
  private async entry(
    directory: NonNullable<NativeDeviceReferenceScan['directory']>,
    signal?: AbortSignal,
  ): Promise<AiReferenceSummary | undefined> {
    const entry = await directory.handle.read();
    if (entry === null) {
      await directory.handle.close();
      this.directory = undefined;
      return undefined;
    }
    if (
      entry.isSymbolicLink() ||
      entry.name === '.operations' ||
      (!entry.isFile() && !entry.isDirectory())
    )
      return undefined;
    const path = join(directory.path, entry.name);
    const item = await this.summary(path, signal);
    if (entry.isDirectory() && this.search.request.container === undefined)
      this.directories.add(path);
    return item;
  }
  private async openDirectory(signal?: AbortSignal): Promise<boolean> {
    if (this.directory !== undefined) {
      const info = await this.ctx.fs.stat(
        await this.ctx.fs.resolve(
          this.directory.path,
          signal === undefined ? undefined : { signal },
        ),
        signal,
      );
      if (info?.version !== this.directory.version)
        throw new HarnessRuntimeError(
          'directory_unavailable',
          'Device directory changed while searching.',
        );
      return true;
    }
    const path = this.directories.take();
    if (path === undefined) return false;
    await safeDevicePath(this.binding.path, path);
    const info = await this.ctx.fs.stat(
      await this.ctx.fs.resolve(path, signal === undefined ? undefined : { signal }),
      signal,
    );
    if (info?.type !== 'directory')
      throw new HarnessRuntimeError(
        'directory_unavailable',
        'Device search directory is unavailable.',
      );
    this.directory = { handle: await opendir(path), path, version: info.version };
    return true;
  }
  private async summary(path: string, signal?: AbortSignal): Promise<AiReferenceSummary> {
    await safeDevicePath(this.binding.path, path);
    const target = await this.ctx.fs.resolve(path, signal === undefined ? undefined : { signal });
    const info = await this.ctx.fs.stat(target, signal);
    if (info === undefined || info.type === 'other')
      throw new HarnessRuntimeError(
        'directory_unavailable',
        'Device entry has no safe current metadata.',
      );
    const relativePath = relative(this.binding.path, path);
    return {
      reference: {
        kind: 'device_path',
        target: this.binding.target,
        workspace_root: this.search.root,
        path: relativePath,
        entry_kind: info.type,
        version: info.version,
      },
      label: relativePath.split('/').at(-1) ?? relativePath,
      subtitle: `${this.binding.target.device_id} · ${relativePath}`,
    };
  }
  close(): Promise<void> {
    this.closed ??= this.finish();
    return this.closed;
  }
  private async finish(): Promise<void> {
    const closed = await Promise.allSettled([
      this.directory?.handle.close(),
      this.directories.close(),
    ]);
    this.directory = undefined;
    const failures: unknown[] = [];
    for (const item of closed) if (item.status === 'rejected') failures.push(item.reason);
    if (failures.length > 0) throw new AggregateError(failures, 'Device reference cleanup failed.');
  }
  revision(): string {
    return referenceHash(this.search.root);
  }
}

function matchesDeviceQuery(item: AiReferenceSummary, query: string): boolean {
  const text =
    item.reference.kind === 'device_path' ? `${item.label} ${item.reference.path}` : item.label;
  return text.toLocaleLowerCase().includes(query.toLocaleLowerCase());
}
