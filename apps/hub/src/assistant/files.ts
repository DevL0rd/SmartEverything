import { createHash, randomUUID } from 'node:crypto';
import {
  appendFile,
  mkdir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, extname, join, sep } from 'node:path';
import {
  ASSISTANT_ATTACHMENT_BYTES_MAX,
  ASSISTANT_UPLOAD_CHUNK_BYTES,
  ApiError,
  type AssistantOutFile,
} from '@smarteverything/domain';
import type {
  AssistantChatRepository,
  StoredAttachment,
} from '../store/repositories/assistant-chat';
import { imageSize } from './image-size';

const UPLOAD_LIFETIME_MS = 10 * 60_000;
const UNATTACHED_KEPT_MS = 24 * 60 * 60_000;

const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.json': 'application/json',
  '.csv': 'text/csv',
  '.html': 'text/html',
  '.zip': 'application/zip',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

interface Upload {
  readonly id: string;
  readonly profileId: string;
  readonly name: string;
  readonly mime: string;
  readonly bytes: number;
  readonly expiresAt: number;
  received: number;
  nextIndex: number;
}

export interface UploadStart {
  readonly profileId: string;
  readonly name: string;
  readonly mime: string;
  readonly bytes: number;
}

export interface FilesOptions {
  readonly dataDirectory: string;
  readonly chat: AssistantChatRepository;
  readonly now: () => Date;
}

function safeName(name: string): string {
  const cleaned = basename(name)
    .replace(/[^\p{L}\p{N}._ -]+/gu, '_')
    .trim();
  return cleaned === '' || cleaned.startsWith('.') ? `file${cleaned}` : cleaned.slice(0, 120);
}

export function mimeOf(name: string): string {
  return MIME_BY_EXTENSION[extname(name).toLowerCase()] ?? 'application/octet-stream';
}

function within(path: string, root: string): boolean {
  return path === root || path.startsWith(`${root}${sep}`);
}

export class AssistantFiles {
  private readonly uploads = new Map<string, Upload>();

  constructor(private readonly options: FilesOptions) {}

  get root(): string {
    return join(this.options.dataDirectory, 'assistant');
  }

  pathOf(file: Pick<StoredAttachment, 'storage_path'>): string {
    return join(this.root, file.storage_path);
  }

  async start(
    input: UploadStart,
  ): Promise<{ uploadId: string; chunkBytes: number; expiresAt: string }> {
    await this.forgetStale();
    const id = randomUUID();
    const expiresAt = this.options.now().getTime() + UPLOAD_LIFETIME_MS;
    this.uploads.set(id, { id, ...input, expiresAt, received: 0, nextIndex: 0 });
    await mkdir(join(this.root, 'uploads'), { recursive: true, mode: 0o700 });
    return {
      uploadId: id,
      chunkBytes: ASSISTANT_UPLOAD_CHUNK_BYTES,
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }

  async chunk(profileId: string, uploadId: string, index: number, data: string): Promise<number> {
    const upload = this.upload(profileId, uploadId);
    if (index !== upload.nextIndex) {
      throw new ApiError(
        'invalid_request',
        `Send chunk ${String(upload.nextIndex)} next, not ${String(index)}.`,
      );
    }
    const bytes = Buffer.from(data, 'base64');
    if (
      bytes.length === 0 ||
      bytes.length > ASSISTANT_UPLOAD_CHUNK_BYTES ||
      upload.received + bytes.length > upload.bytes
    ) {
      throw new ApiError('invalid_request', 'This chunk does not fit the upload’s size.');
    }
    await appendFile(this.partPath(uploadId), bytes, { mode: 0o600 });
    upload.received += bytes.length;
    upload.nextIndex += 1;
    return upload.received;
  }

  async finish(profileId: string, uploadId: string): Promise<StoredAttachment> {
    const upload = this.upload(profileId, uploadId);
    if (upload.received !== upload.bytes) {
      throw new ApiError(
        'invalid_request',
        `The upload has ${String(upload.received)} of ${String(upload.bytes)} bytes.`,
      );
    }
    this.uploads.delete(uploadId);
    const content = await readFile(this.partPath(uploadId));
    const file = await this.keep({
      id: uploadId,
      profileId,
      name: upload.name,
      mime: upload.mime,
      content,
    });
    await rm(this.partPath(uploadId), { force: true });
    return file;
  }

  async fromResponder(
    profileId: string,
    file: AssistantOutFile,
    local: boolean,
  ): Promise<StoredAttachment> {
    if ('uploadId' in file) {
      return this.options.chat.attachment(file.uploadId);
    }
    if (!local) {
      throw new ApiError(
        'forbidden',
        'Files by path can only be sent from this computer; use the upload operations.',
      );
    }
    const path = await this.tempFile(file.path);
    const content = await readFile(path);
    const name = safeName(basename(path));
    return this.keep({ id: randomUUID(), profileId, name, mime: mimeOf(name), content });
  }

  async remove(files: readonly StoredAttachment[]): Promise<void> {
    await Promise.all(
      files.map((file) => rm(join(this.root, 'files', file.id), { recursive: true, force: true })),
    );
  }

  private async tempFile(path: string): Promise<string> {
    const [real, root] = await Promise.all([realpath(path), realpath(tmpdir())]);
    if (!within(real, root)) {
      throw new ApiError(
        'forbidden',
        `Only files in the temp folder (${root}) can be sent; copy it there first.`,
      );
    }
    const info = await stat(real);
    if (!info.isFile() || info.size === 0 || info.size > ASSISTANT_ATTACHMENT_BYTES_MAX) {
      throw new ApiError('invalid_request', 'That path is not a file of at most 25 MB.');
    }
    return real;
  }

  private async keep(input: {
    readonly id: string;
    readonly profileId: string;
    readonly name: string;
    readonly mime: string;
    readonly content: Buffer;
  }): Promise<StoredAttachment> {
    const name = safeName(input.name);
    const relative = join('files', input.id, name);
    await mkdir(join(this.root, 'files', input.id), { recursive: true, mode: 0o700 });
    const temporary = join(this.root, 'files', input.id, `.${name}.part`);
    await writeFile(temporary, input.content, { mode: 0o600 });
    await rename(temporary, join(this.root, relative));
    const size = input.mime.startsWith('image/') ? imageSize(input.content) : null;
    return this.options.chat.addAttachment({
      id: input.id,
      profile_id: input.profileId,
      name,
      mime: input.mime,
      bytes: input.content.length,
      width: size?.width ?? null,
      height: size?.height ?? null,
      storage_path: relative,
      sha256: createHash('sha256').update(input.content).digest('hex'),
    });
  }

  private upload(profileId: string, uploadId: string): Upload {
    const upload = this.uploads.get(uploadId);
    if (upload?.profileId !== profileId || upload.expiresAt <= this.options.now().getTime()) {
      throw new ApiError('not_found', 'This upload is not open; start it again.');
    }
    return upload;
  }

  private partPath(uploadId: string): string {
    return join(this.root, 'uploads', `${uploadId}.part`);
  }

  private async forgetStale(): Promise<void> {
    const now = this.options.now().getTime();
    const expired = [...this.uploads.values()].filter((upload) => upload.expiresAt <= now);
    expired.forEach((upload) => this.uploads.delete(upload.id));
    await Promise.all(expired.map((upload) => rm(this.partPath(upload.id), { force: true })));
    const stale = this.options.chat.unattachedBefore(
      new Date(now - UNATTACHED_KEPT_MS).toISOString(),
    );
    await this.remove(stale);
    this.options.chat.removeAttachments(stale.map((file) => file.id));
  }
}
