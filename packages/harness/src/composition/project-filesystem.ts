import type { Context } from '@deepseek-ai/cordis';
import FileSystem, { FsError, FsTargetKey, FsVersion } from '@deepseek-ai/dsh-fs';
import type {
  FsTarget,
  FsInfo,
  FsPathInfo,
  FsDirEntry,
  FsWriteOutcome,
  FsEditOutcome,
} from '@deepseek-ai/dsh-fs';
import {
  AI_PROJECT_PATH,
  AI_PROJECT_CHUNK_BYTES,
  AI_PROJECT_BYTES_MAX,
} from '@smarteverything/domain';
import type { AiProjectRequest, AiProjectResult } from '@smarteverything/domain';
import { randomUUID } from 'node:crypto';
import { posix } from 'node:path';
import type { ProjectFileScopes, ProjectFilePort } from './project-files';

export class ProjectFileSystem extends FileSystem {
  constructor(
    ctx: Context,
    private readonly local: FileSystem,
    readonly scopes: ProjectFileScopes,
    private readonly port: ProjectFilePort,
  ) {
    super(ctx);
  }
  runtimeFileContext(ctx: Context): Context {
    const asset = ctx.isolate('fs');
    const owner = asset.plugin((runtime: Context): void => {
      runtime.provide('fs', this.local);
    });
    return owner.ctx;
  }
  private managed(): boolean {
    return this.scopes.current()?.binding.kind === 'managed';
  }
  private path(target: FsTarget): string {
    this.scopes.managed();
    if (target.targetKey !== FsTargetKey(`${this.scopes.sessionId()}:${target.displayPath}`))
      throw new FsError(
        'File target belongs to another admitted conversation.',
        'FS_PERMISSION_DENIED',
      );
    return AI_PROJECT_PATH.parse(target.displayPath);
  }
  async resolve(path: string, opts?: { cwd?: string; signal?: AbortSignal }): Promise<FsTarget> {
    if (!this.managed()) return this.local.resolve(path, opts);
    opts?.signal?.throwIfAborted();
    this.scopes.managed();
    const relative = managedPath(path);
    return {
      targetKey: FsTargetKey(`${this.scopes.sessionId()}:${relative}`),
      displayPath: relative,
    };
  }
  processPath(target: FsTarget): string {
    if (!this.managed()) return this.local.processPath(target);
    return this.path(target);
  }
  override processPathFromHostPath(path: string): string | undefined {
    return this.managed() ? undefined : this.local.processPathFromHostPath(path);
  }
  fileUrl(target: FsTarget): string {
    return this.managed()
      ? `smarteverything-project:${this.path(target)}`
      : this.local.fileUrl(target);
  }
  contains(parent: FsTarget, child: FsTarget): boolean {
    if (!this.managed()) return this.local.contains(parent, child);
    const root = this.path(parent);
    const path = this.path(child);
    return path === root || path.startsWith(`${root}/`);
  }
  override get sandboxMode(): 'workspace-write' | undefined {
    return this.managed() ? 'workspace-write' : undefined;
  }
  private call(request: AiProjectRequest, signal?: AbortSignal): Promise<AiProjectResult> {
    signal?.throwIfAborted();
    const execution = this.scopes.managed().execution;
    return this.port(
      signal === undefined ? execution : Object.freeze({ ...execution, signal }),
      request,
    );
  }
  async stat(target: FsTarget, signal?: AbortSignal): Promise<FsInfo | undefined> {
    if (!this.managed()) return this.local.stat(target, signal);
    const result = await this.call({ operation: 'stat', path: this.path(target) }, signal);
    return result.file === null || result.file === undefined
      ? undefined
      : {
          version: FsVersion(result.file.version),
          type: result.file.type,
          size: result.file.bytes,
        };
  }
  async lstat(
    path: string,
    opts?: { cwd?: string },
    signal?: AbortSignal,
  ): Promise<FsPathInfo | undefined> {
    return this.managed()
      ? this.stat(await this.resolve(path, opts), signal)
      : this.local.lstat(path, opts, signal);
  }
  async readText(target: FsTarget, signal?: AbortSignal): Promise<string> {
    if (!this.managed()) return this.local.readText(target, signal);
    const chunks = await this.streamText(target, signal);
    let text = '';
    for await (const chunk of chunks) text += chunk;
    return text;
  }
  async streamText(target: FsTarget, signal?: AbortSignal): Promise<AsyncIterable<string>> {
    if (!this.managed()) return this.local.streamText(target, signal);
    const info = await this.stat(target, signal);
    if (info === undefined) throw new FsError('Managed file is absent.', 'FS_NOT_FOUND');
    if (info.type !== 'file')
      throw new FsError('Managed text read requires a regular file.', 'FS_NOT_REGULAR_FILE');
    if (info.size === undefined || info.size > AI_PROJECT_BYTES_MAX)
      throw new FsError('Managed file exceeds the text read bound.', 'FS_TOO_LARGE');
    return this.textChunks(target, info.size, info.version, signal);
  }
  private async *textChunks(
    target: FsTarget,
    size: number,
    version: FsVersion,
    signal?: AbortSignal,
  ): AsyncIterable<string> {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    for (let offset = 0; offset < size; offset += AI_PROJECT_CHUNK_BYTES) {
      const bytes = await this.readByteRange(
        target,
        { offset, length: Math.min(AI_PROJECT_CHUNK_BYTES, size - offset) },
        signal,
      );
      const text = decodedText(decoder, bytes, true);
      if (text.includes('\0')) throw new FsError('Managed file is binary.', 'FS_NOT_TEXT');
      yield text;
    }
    yield decodedText(decoder, new Uint8Array(), false);
    if ((await this.stat(target, signal))?.version !== version)
      throw new FsError('Managed file changed during read.', 'FS_STALE_VERSION');
  }
  async readBytes(
    target: FsTarget,
    signal: AbortSignal | undefined,
    maxBytes: number,
  ): Promise<Uint8Array> {
    if (!this.managed()) return this.local.readBytes(target, signal, maxBytes);
    const info = await this.stat(target, signal);
    if (info === undefined) throw new FsError('Managed file is absent.', 'FS_NOT_FOUND');
    if (info.size === undefined || info.size > maxBytes)
      throw new FsError('Managed file exceeds this read bound.', 'FS_TOO_LARGE');
    const chunks: Buffer[] = [];
    for (let offset = 0; offset < info.size; offset += AI_PROJECT_CHUNK_BYTES)
      chunks.push(
        Buffer.from(
          await this.readByteRange(
            target,
            { offset, length: Math.min(AI_PROJECT_CHUNK_BYTES, info.size - offset) },
            signal,
          ),
        ),
      );
    if ((await this.stat(target, signal))?.version !== info.version)
      throw new FsError('Managed file changed during read.', 'FS_STALE_VERSION');
    return Buffer.concat(chunks);
  }
  async readByteRange(
    target: FsTarget,
    range: { offset: number; length: number },
    signal?: AbortSignal,
  ): Promise<Uint8Array> {
    if (!this.managed()) return this.local.readByteRange(target, range, signal);
    const result = await this.call(
      { operation: 'read', path: this.path(target), ...range, encoding: 'base64' },
      signal,
    );
    if (result.content === undefined)
      throw new FsError('Managed read omitted its bytes.', 'FS_IO_ERROR');
    return Buffer.from(result.content, 'base64');
  }
  async listDir(target: FsTarget, signal?: AbortSignal): Promise<FsDirEntry[]> {
    if (!this.managed()) return this.local.listDir(target, signal);
    const result = await this.call(
      { operation: 'list', path: this.path(target), limit: 1000 },
      signal,
    );
    if (result.entries === undefined || result.truncated === true)
      throw new FsError('Managed directory exceeds the complete listing bound.', 'FS_TOO_LARGE');
    return Promise.all(
      result.entries.map(async (entry) => ({
        name: posix.basename(entry.path),
        type: entry.type,
        target: await this.resolve(entry.path),
        version: FsVersion(entry.version),
        size: entry.bytes,
      })),
    );
  }
  async writeText(...args: Parameters<FileSystem['writeText']>): Promise<FsWriteOutcome> {
    const [target, content, expected, signal, policy] = args;
    if (!this.managed()) return this.local.writeText(target, content, expected, signal, policy);
    if (expected === undefined)
      throw new FsError(
        'Managed writes require an observed version or absence.',
        'FS_NOT_OBSERVED',
      );
    const path = this.path(target);
    const version = expected.kind === 'createIfAbsent' ? null : expected.version;
    const result =
      Buffer.byteLength(content) > AI_PROJECT_CHUNK_BYTES
        ? await this.transfer(path, content, version, signal)
        : await this.call(
            {
              operation: 'write',
              path,
              content,
              encoding: 'utf8',
              version,
              operation_id: randomUUID(),
            },
            signal,
          );
    if (result.file === null || result.file === undefined)
      throw new FsError('Managed write omitted its committed version.', 'FS_IO_ERROR');
    return {
      operation: version === null ? 'create' : 'update',
      version: FsVersion(result.file.version),
      before: result.before ?? null,
      after: content.replace(/\r\n/g, '\n'),
    };
  }
  private async transfer(
    path: string,
    content: string,
    version: string | null,
    signal?: AbortSignal,
  ): Promise<AiProjectResult> {
    const bytes = Buffer.from(content);
    const transfer_id = randomUUID();
    await this.call(
      {
        operation: 'transfer_start',
        path,
        version,
        transfer_id,
        total_bytes: bytes.length,
        encoding: 'utf8',
        operation_id: randomUUID(),
      },
      signal,
    );
    for (let offset = 0; offset < bytes.length; offset += AI_PROJECT_CHUNK_BYTES)
      await this.call(
        {
          operation: 'transfer_chunk',
          path,
          transfer_id,
          offset,
          content: bytes.subarray(offset, offset + AI_PROJECT_CHUNK_BYTES).toString('base64'),
          operation_id: randomUUID(),
        },
        signal,
      );
    return this.call(
      { operation: 'transfer_finish', path, transfer_id, operation_id: randomUUID() },
      signal,
    );
  }
  async editText(...args: Parameters<FileSystem['editText']>): Promise<FsEditOutcome> {
    const [target, edit, expected, signal, policy] = args;
    if (!this.managed()) return this.local.editText(target, edit, expected, signal, policy);
    if (expected === undefined)
      throw new FsError('Managed edits require an observed version.', 'FS_NOT_OBSERVED');
    const before = (await this.readText(target, signal)).replace(/\r\n/g, '\n');
    const result = await this.call(
      {
        operation: 'edit',
        path: this.path(target),
        version: expected.version,
        old_string: edit.oldString,
        new_string: edit.newString,
        replace_all: edit.replaceAll,
        operation_id: randomUUID(),
      },
      signal,
    );
    if (result.file === null || result.file === undefined)
      throw new FsError('Managed edit omitted its committed version.', 'FS_IO_ERROR');
    const oldString = edit.oldString.replace(/\r\n/g, '\n');
    const newString = edit.newString.replace(/\r\n/g, '\n');
    const after = edit.replaceAll
      ? before.split(oldString).join(newString)
      : before.replace(oldString, () => newString);
    return { version: FsVersion(result.file.version), before, after };
  }
}
export function managedPath(path: string): string {
  if (path.startsWith('/') || path.includes('\\') || path.includes('%'))
    throw new FsError(
      'Managed paths must be relative to the central workspace.',
      'FS_PERMISSION_DENIED',
    );
  if (path === '.') return 'workspace';
  return AI_PROJECT_PATH.parse(
    /^(workspace|temporary|transfers)(\/|$)/u.test(path) ? path : `workspace/${path}`,
  );
}

function decodedText(decoder: TextDecoder, bytes: Uint8Array, stream: boolean): string {
  try {
    return decoder.decode(bytes, { stream });
  } catch (cause) {
    throw new FsError('Managed file is not valid UTF-8 text.', 'FS_NOT_TEXT', { cause });
  }
}
