import type { Context } from '@deepseek-ai/cordis';
import type { FsTarget } from '@deepseek-ai/dsh-fs';
import { fdir } from 'fdir';
import { isDeepStrictEqual } from 'node:util';
import { posix, resolve } from 'node:path';
import type {
  AiHarnessStorageBinding,
  AiReference,
  AiReferenceSearch,
  AiReferenceSummary,
} from '@smarteverything/domain';
import { HarnessRuntimeError } from '../host/errors';
import { referenceHash } from './identity';

const IGNORED_DIRECTORIES = new Set(['.git', 'node_modules']);
const HIDDEN_ENTRY = '.operations';
type Binding = Extract<AiHarnessStorageBinding, { kind: 'device' }>;
interface NativeReferencePage {
  readonly items: readonly AiReferenceSummary[];
  readonly complete: boolean;
}

function abortable(signal: AbortSignal | undefined): { signal?: AbortSignal } {
  return signal === undefined ? {} : { signal };
}

async function deviceRoot(ctx: Context, binding: Binding): Promise<string> {
  const target = await ctx.fs.resolve(binding.path);
  const info = await ctx.fs.stat(target);
  if (info?.type !== 'directory')
    throw new HarnessRuntimeError(
      'directory_unavailable',
      'The explicit device workspace is unavailable.',
    );
  return ctx.fs.processPath(target);
}

export async function resolveDeviceReference(
  ctx: Context,
  binding: Binding,
  reference: Extract<AiReference, { kind: 'device_path' }>,
  signal?: AbortSignal,
): Promise<void> {
  if (!isDeepStrictEqual(binding.target, reference.target))
    throw new HarnessRuntimeError(
      'directory_unavailable',
      'The referenced device is not the selected machine.',
    );
  const root = await ctx.fs.resolve(reference.workspace_root, abortable(signal));
  const target = await ctx.fs.resolve(reference.path, {
    cwd: reference.workspace_root,
    ...abortable(signal),
  });
  const info = await ctx.fs.stat(target, signal);
  if (!ctx.fs.contains(root, target) || info?.type !== reference.entry_kind)
    throw new HarnessRuntimeError(
      'directory_unavailable',
      'The referenced device entry is gone or moved out of its workspace.',
    );
}

export class NativeDeviceReferenceScan {
  private position = 0;

  private constructor(
    private readonly ctx: Context,
    private readonly binding: Binding,
    private readonly root: { readonly path: string; readonly target: FsTarget },
    private readonly matches: readonly string[],
  ) {}

  static async open(
    ctx: Context,
    binding: Binding,
    request: AiReferenceSearch,
    signal?: AbortSignal,
  ): Promise<NativeDeviceReferenceScan> {
    const path = await deviceRoot(ctx, binding);
    const container = request.container;
    if (container !== undefined) {
      if (container.kind !== 'device_path')
        throw new HarnessRuntimeError(
          'directory_unavailable',
          'This container is not on the selected device.',
        );
      await resolveDeviceReference(ctx, binding, container, signal);
    }
    const found = await crawl(path, container?.path, request.query, signal);
    signal?.throwIfAborted();
    return new NativeDeviceReferenceScan(
      ctx,
      binding,
      { path, target: await ctx.fs.resolve(path) },
      found,
    );
  }

  async next(limit: number, signal?: AbortSignal): Promise<NativeReferencePage> {
    const slice = this.matches.slice(this.position, this.position + limit);
    this.position += slice.length;
    const summaries = await Promise.all(slice.map((path) => this.summary(path, signal)));
    return {
      items: summaries.filter((item) => item !== undefined),
      complete: this.position >= this.matches.length,
    };
  }

  revision(): string {
    return referenceHash(this.root.path);
  }

  private async summary(
    path: string,
    signal?: AbortSignal,
  ): Promise<AiReferenceSummary | undefined> {
    const target = await this.ctx.fs.resolve(path, { cwd: this.root.path, ...abortable(signal) });
    const info = await this.ctx.fs.stat(target, signal);
    if (
      info === undefined ||
      info.type === 'other' ||
      !this.ctx.fs.contains(this.root.target, target)
    )
      return undefined;
    return {
      reference: {
        kind: 'device_path',
        target: this.binding.target,
        workspace_root: this.root.path,
        path,
        entry_kind: info.type,
        version: info.version,
      },
      label: posix.basename(path),
      subtitle: `${this.binding.target.device_id} · ${path}`,
    };
  }
}

async function crawl(
  root: string,
  container: string | undefined,
  query: string,
  signal: AbortSignal | undefined,
): Promise<readonly string[]> {
  const prefix = container === undefined ? '' : `${container}/`;
  const needle = query.toLocaleLowerCase();
  const start = resolve(root, container ?? '.');
  const skipped: string[] = [];
  const matches = (path: string): boolean =>
    path !== '.' &&
    posix.basename(path) !== HIDDEN_ENTRY &&
    `${posix.basename(path)} ${prefix}${path}`.toLocaleLowerCase().includes(needle);
  const base = new fdir()
    .withRelativePaths()
    .withPathSeparator('/')
    .withDirs()
    .exclude((name, path) => {
      if (!IGNORED_DIRECTORIES.has(name)) return false;
      skipped.push(posix.relative(start, path));
      return true;
    })
    .filter((entry) => matches(stripSlash(entry)));
  const shallow = container === undefined ? base : base.withMaxDepth(0);
  const found = await (signal === undefined ? shallow : shallow.withAbortSignal(signal))
    .crawl(start)
    .withPromise();
  return [...found.map(stripSlash), ...skipped.filter(matches)]
    .map((entry) => `${prefix}${entry}`)
    .sort((left, right) => depth(left) - depth(right) || left.localeCompare(right));
}

function stripSlash(entry: string): string {
  return entry.endsWith('/') ? entry.slice(0, -1) : entry;
}

function depth(path: string): number {
  return path.split('/').length;
}
