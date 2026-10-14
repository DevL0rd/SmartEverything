import { projectTextFile } from './text-files';
import { constants } from 'node:fs';
import { link, lstat, open, rename, rm } from 'node:fs/promises';
import { ApiError, AI_PROJECT_CHUNK_BYTES, type AiProjectResult } from '@smarteverything/domain';
import type { HarnessLocalFileSystem } from '@smarteverything/harness';
import { PROJECT_TRANSFER } from './transfer-contract';
import type { z } from 'zod';
import type { ProjectAuthority } from './authority';
import type { ProjectPaths } from './paths';
import { identity } from './paths';
import { projectStat } from './reads';
import { requireVersion, projectTextResult, type ProjectMutation } from './mutations';
type Transfer = z.output<typeof PROJECT_TRANSFER>;
type Request = Extract<
  ProjectMutation,
  { operation: 'transfer_start' | 'transfer_chunk' | 'transfer_finish' | 'transfer_cancel' }
>;
export class ProjectTransfers {
  constructor(private readonly paths: ProjectPaths) {}
  async execute(
    fs: HarnessLocalFileSystem,
    authority: ProjectAuthority,
    request: Request,
  ): Promise<AiProjectResult> {
    if (request.path.split('/').length < 2)
      throw new ApiError(
        'forbidden',
        'A transfer destination must be a file below a managed area.',
      );
    if (request.operation === 'transfer_start') return this.start(fs, authority, request);
    const manifest = await this.manifest(authority, request.transfer_id);
    if (manifest.path !== request.path)
      throw new ApiError('forbidden', 'The transfer belongs to a different exact destination.');
    switch (request.operation) {
      case 'transfer_chunk':
        return this.chunk(authority, request, manifest);
      case 'transfer_finish':
        return this.finish(fs, authority, request, manifest);
      case 'transfer_cancel': {
        authority.validate(true);
        await this.discard(authority.chatId, request.transfer_id);
        return { operation: request.operation, path: request.path };
      }
    }
  }
  private async start(
    fs: HarnessLocalFileSystem,
    authority: ProjectAuthority,
    request: Extract<Request, { operation: 'transfer_start' }>,
  ): Promise<AiProjectResult> {
    await requireVersion(this.paths, fs, authority.chatId, request);
    const part = await this.paths.parent(authority.chatId, this.part(request.transfer_id));
    authority.validate(true);
    const handle = await open(part, 'wx', 0o600);
    await handle.close();
    await this.save(authority, {
      transfer_id: request.transfer_id,
      path: request.path,
      version: request.version,
      encoding: request.encoding,
      total_bytes: request.total_bytes,
      received: 0,
      state: 'receiving',
    });
    return { operation: request.operation, path: request.path, next_offset: 0 };
  }
  private async manifest(authority: ProjectAuthority, id: string): Promise<Transfer> {
    const read = await this.paths.bytes(authority.chatId, this.metadata(id), 0, {
      length: 8192,
      validate: (): void => {
        authority.validate(false);
      },
    });
    if (read.size > 8192)
      throw new ApiError('internal', 'The managed transfer manifest exceeds its limit.');
    return PROJECT_TRANSFER.parse(JSON.parse(read.bytes.toString('utf8')));
  }
  private async chunk(
    authority: ProjectAuthority,
    request: Extract<Request, { operation: 'transfer_chunk' }>,
    manifest: Transfer,
  ): Promise<AiProjectResult> {
    const bytes = transferChunk(request.content);
    if (
      manifest.state !== 'receiving' ||
      request.offset !== manifest.received ||
      request.offset + bytes.length > manifest.total_bytes
    )
      throw new ApiError('conflict', 'Send the exact next bounded project transfer chunk.');
    const path = await this.paths.resolve(authority.chatId, this.part(request.transfer_id));
    const before = await lstat(path);
    const handle = await open(path, constants.O_RDWR | constants.O_NOFOLLOW);
    try {
      const info = await handle.stat();
      if (
        !info.isFile() ||
        info.nlink !== 1 ||
        identity(info) !== identity(before) ||
        info.size !== request.offset
      )
        throw new ApiError(
          'conflict',
          'The managed transfer file identity or received prefix changed.',
        );
      authority.validate(true);
      await handle.write(bytes, 0, bytes.length, request.offset);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await this.save(authority, { ...manifest, received: manifest.received + bytes.length });
    return {
      operation: request.operation,
      path: request.path,
      next_offset: manifest.received + bytes.length,
    };
  }
  private async finish(
    fs: HarnessLocalFileSystem,
    authority: ProjectAuthority,
    request: Extract<Request, { operation: 'transfer_finish' }>,
    manifest: Transfer,
  ): Promise<AiProjectResult> {
    if (manifest.state !== 'receiving' || manifest.received !== manifest.total_bytes)
      throw new ApiError('conflict', 'The managed project transfer is not completely received.');
    const source = await this.paths.resolve(authority.chatId, this.part(request.transfer_id));
    const info = await lstat(source);
    if (!info.isFile() || info.size !== manifest.total_bytes)
      throw new ApiError('conflict', 'The received project transfer size changed.');
    if (manifest.encoding === 'utf8')
      return this.finishText(fs, authority, request, { manifest, source });
    const target = await this.paths.parent(authority.chatId, request.path);
    await requireVersion(this.paths, fs, authority.chatId, manifest);
    authority.validate(true);
    if (manifest.version === null) await link(source, target);
    else await rename(source, target);
    await rm(source, { force: true });
    await this.save(authority, { ...manifest, state: 'committed' });
    return {
      operation: request.operation,
      path: request.path,
      file: await projectStat(this.paths, fs, authority.chatId, request.path),
    };
  }
  private async finishText(
    fs: HarnessLocalFileSystem,
    authority: ProjectAuthority,
    request: Extract<Request, { operation: 'transfer_finish' }>,
    input: { readonly manifest: Transfer; readonly source: string },
  ): Promise<AiProjectResult> {
    const { manifest, source } = input;
    const text = await fs.readText(await fs.resolve(source));
    const outcome = await projectTextFile(this.paths, fs, authority, {
      operation: 'write',
      path: request.path,
      operation_id: request.operation_id,
      version: manifest.version,
      content: text,
      encoding: 'utf8',
    });
    await rm(source, { force: true });
    await this.save(authority, { ...manifest, state: 'committed' });
    return projectTextResult(
      request,
      outcome,
      await projectStat(this.paths, fs, authority.chatId, request.path),
    );
  }
  private async save(authority: ProjectAuthority, manifest: Transfer): Promise<void> {
    const path = await this.paths.parent(authority.chatId, this.metadata(manifest.transfer_id));
    const temporary = `${path}.part`;
    authority.validate(true);
    const handle = await open(temporary, 'wx', 0o600);
    try {
      await handle.writeFile(JSON.stringify(manifest));
      await handle.sync();
    } finally {
      await handle.close();
    }
    authority.validate(true);
    await rename(temporary, path);
  }
  private async discard(chat: string, id: string): Promise<void> {
    for (const path of [this.part(id), this.metadata(id)])
      await rm(await this.paths.resolve(chat, path, true), { force: true });
  }
  private part(id: string): string {
    return `transfers/.operations/${id}.bytes`;
  }
  private metadata(id: string): string {
    return `transfers/.operations/${id}.transfer.json`;
  }
}

function transferChunk(content: string): Buffer {
  const bytes = Buffer.from(content, 'base64');
  if (
    bytes.length === 0 ||
    bytes.length > AI_PROJECT_CHUNK_BYTES ||
    bytes.toString('base64') !== content
  )
    throw new ApiError(
      'invalid_request',
      'Transfer chunks require canonical base64 of at most 256 KiB.',
    );
  return bytes;
}
