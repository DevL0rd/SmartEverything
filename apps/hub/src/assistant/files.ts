import { remoteRefusal, resolveOutFile } from './out-file-path';
import mime from 'mime-types';
import type { HubLayout } from '../data-layout';
import type { ProjectFilesService } from '../projects/service';
import { createHash, randomUUID } from 'node:crypto';
import { appendFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
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
import { imageSize } from './image/dimensions';
import { audioLevels } from '../media/audio-levels';
import { attachmentNote } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { mediaKindOf, type MediaNotes } from '../transcripts/media-notes';

const log = new Logger('hub.assistant-files');
const UPLOAD_LIFETIME_MS = 10 * 60_000;
const UNATTACHED_KEPT_MS = 24 * 60 * 60_000;

interface Upload {
  readonly id: string;
  readonly profileId: string;
  readonly name: string;
  readonly mime: string;
  readonly bytes: number;
  readonly levels: readonly number[] | null;
  readonly expiresAt: number;
  received: number;
  nextIndex: number;
}

export interface UploadStart {
  readonly profileId: string;
  readonly name: string;
  readonly mime: string;
  readonly bytes: number;
  readonly levels?: readonly number[] | null | undefined;
}

export interface FilesOptions {
  readonly layout: HubLayout;
  readonly chat: AssistantChatRepository;
  readonly now: () => Date;
  readonly projects?: ProjectFilesService;
}

function safeName(name: string): string {
  const cleaned = basename(name)
    .replace(/[^\p{L}\p{N}._ -]+/gu, '_')
    .trim();
  return cleaned === '' || cleaned.startsWith('.') ? `file${cleaned}` : cleaned.slice(0, 120);
}

export function attachmentMimeOf(name: string): string {
  const type = mime.lookup(name);
  return type === false ? 'application/octet-stream' : type;
}

export class AssistantFiles {
  private readonly preparing = new Set<string>();
  private readonly uploads = new Map<string, Upload>();
  private notes: Pick<MediaNotes, 'ensure' | 'later' | 'wants'> | undefined;

  constructor(private readonly options: FilesOptions) {}

  attachMediaNotes(notes: Pick<MediaNotes, 'ensure' | 'later' | 'wants'>): void {
    this.notes = notes;
  }

  noteOf(file: StoredAttachment): string | null {
    if (mediaKindOf(file.mime) === null) return file.transcript;
    const stored = this.options.chat.attachment(file.id).transcript;
    if (stored === null) this.notes?.later(file);
    return stored;
  }

  noteLine(file: StoredAttachment): string {
    const stored = this.noteOf(file);
    return attachmentNote(file, stored, {
      pending: stored === null && this.notes?.wants(file) === true,
    });
  }

  private noted(file: StoredAttachment): StoredAttachment {
    if (mediaKindOf(file.mime) !== null) this.notes?.later(file);
    return file;
  }

  pathOf(file: Pick<StoredAttachment, 'id' | 'profile_id' | 'name'>): string {
    return this.options.layout.person(file.profile_id).attachment(file.id, file.name);
  }

  async start(
    input: UploadStart,
  ): Promise<{ uploadId: string; chunkBytes: number; expiresAt: string }> {
    await this.forgetStale();
    const id = randomUUID();
    const expiresAt = this.options.now().getTime() + UPLOAD_LIFETIME_MS;
    this.uploads.set(id, {
      id,
      ...input,
      levels: input.levels ?? null,
      expiresAt,
      received: 0,
      nextIndex: 0,
    });
    await mkdir(this.options.layout.tmp, { recursive: true, mode: 0o700 });
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
      levels: upload.levels,
    });
    await rm(this.partPath(uploadId), { force: true });
    return file;
  }

  async fromOutFile(
    profileId: string,
    file: AssistantOutFile,
    scope: { readonly local: boolean; readonly chatId: string; readonly authorize: () => void },
  ): Promise<StoredAttachment> {
    if ('uploadId' in file) {
      return this.options.chat.attachment(file.uploadId);
    }
    if (!scope.local) throw remoteRefusal();
    scope.authorize();
    const resolved = await resolveOutFile(
      file.path,
      this.projectsService().root(scope.chatId),
      this.options.layout.tmp,
    );
    const content =
      resolved.home.kind === 'chat'
        ? await this.managedFile(profileId, scope, resolved.home.path)
        : await readFile(resolved.real);
    const name = safeName(basename(file.path));
    return this.keepBytes({
      profileId,
      authorize: scope.authorize,
      name,
      mime: attachmentMimeOf(name),
      content,
      signal: new AbortController().signal,
    });
  }

  private projectsService(): ProjectFilesService {
    if (this.options.projects === undefined)
      throw new ApiError('conflict', 'Chat folder storage is unavailable.');
    return this.options.projects;
  }

  private managedFile(
    profileId: string,
    scope: { readonly chatId: string; readonly authorize: () => void },
    path: string,
  ): Promise<Buffer> {
    return this.projectsService().readFile(
      { chatId: scope.chatId, profileId, validate: scope.authorize },
      path,
      ASSISTANT_ATTACHMENT_BYTES_MAX,
    );
  }

  async copy(file: StoredAttachment): Promise<StoredAttachment> {
    return this.noted(await this.prepareCopy(file));
  }

  async bytesOf(file: StoredAttachment): Promise<Buffer> {
    const content = await readFile(this.pathOf(file));
    if (
      content.length !== file.bytes ||
      createHash('sha256').update(content).digest('hex') !== file.sha256
    )
      throw new ApiError('conflict', `The stored bytes for ${file.name} could not be verified.`);
    return content;
  }

  async prepareCopy(file: StoredAttachment): Promise<StoredAttachment> {
    const content = await this.bytesOf(file);
    const id = randomUUID();
    const name = safeName(file.name);
    const copy = this.options.chat.addAttachment({
      ...this.options.chat.attachment(file.id),
      id,
      name,
      storage_path: join('files', id, name),
    });
    this.preparing.add(copy.id);
    try {
      await this.writeBytes(this.pathOf(copy), content);
      return copy;
    } catch (cause) {
      await this.discardCopies([copy]);
      throw cause;
    } finally {
      this.preparing.delete(copy.id);
    }
  }

  async discardCopies(files: readonly StoredAttachment[]): Promise<void> {
    try {
      await this.discardUnattached(files);
    } catch (cause) {
      log.warn('copy.cleanup_failed', { cause, copies: files.length });
    }
  }

  private discardUnattached(files: readonly StoredAttachment[]): Promise<void> {
    const unbound = files.filter(
      (file) => this.options.chat.findAttachment(file.id)?.message_id === null,
    );
    return this.options.chat.attachmentCleanup.discard(unbound, async (file) => {
      await this.remove([file]);
      this.options.chat.removeAttachments([file.id]);
    });
  }

  async keepBytes(input: {
    readonly authorize: () => void;
    readonly id?: string;
    readonly profileId: string;
    readonly name: string;
    readonly mime: string;
    readonly content: Buffer;
    readonly signal: AbortSignal;
    readonly transcript?: string;
  }): Promise<StoredAttachment> {
    if (input.content.length === 0 || input.content.length > ASSISTANT_ATTACHMENT_BYTES_MAX)
      throw new ApiError('invalid_request', 'Output bytes exceed the supported attachment bound.');
    input.signal.throwIfAborted();
    input.authorize();
    return this.keep({ ...input, id: input.id ?? randomUUID() });
  }

  async remove(files: readonly StoredAttachment[]): Promise<void> {
    await Promise.all(
      files.map((file) => rm(dirname(this.pathOf(file)), { recursive: true, force: true })),
    );
  }

  private async keep(input: {
    readonly id: string;
    readonly profileId: string;
    readonly name: string;
    readonly mime: string;
    readonly content: Buffer;
    readonly transcript?: string | null;
    readonly levels?: readonly number[] | null;
  }): Promise<StoredAttachment> {
    const name = safeName(input.name);
    const storagePath = join('files', input.id, name);
    await this.writeBytes(
      this.options.layout.person(input.profileId).attachment(input.id, name),
      input.content,
    );
    const size = input.mime.startsWith('image/') ? await imageSize(input.content) : null;
    const file = this.options.chat.addAttachment({
      id: input.id,
      profile_id: input.profileId,
      name,
      mime: input.mime,
      bytes: input.content.length,
      width: size?.width ?? null,
      height: size?.height ?? null,
      storage_path: storagePath,
      sha256: createHash('sha256').update(input.content).digest('hex'),
      levels: input.levels ?? (await this.levelsOf(input.mime, input.content)),
    });
    if (input.transcript !== undefined && input.transcript !== null) {
      this.options.chat.setTranscript(file.id, input.transcript);
      return { ...file, transcript: input.transcript };
    }
    return this.noted(file);
  }

  private async levelsOf(mime: string, content: Buffer): Promise<number[] | null> {
    if (!mime.startsWith('audio/')) return null;
    try {
      return await audioLevels(content);
    } catch (cause) {
      log.warn('levels.decode_failed', { cause, mime, bytes: content.length });
      return null;
    }
  }

  async backfillLevels(): Promise<void> {
    const pending = this.options.chat.unleveledAudio();
    let kept = 0;
    for (const file of pending) {
      try {
        this.options.chat.setLevels(file.id, await audioLevels(await this.bytesOf(file)));
        kept += 1;
      } catch (cause) {
        log.warn('levels.backfill_failed', { cause, attachmentId: file.id });
      }
    }
    log.info('levels.backfilled', { pending: pending.length, kept });
  }

  private async writeBytes(path: string, content: Buffer): Promise<void> {
    const directory = dirname(path);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const temporary = join(directory, `.${basename(path)}.part`);
    await writeFile(temporary, content, { mode: 0o600 });
    await rename(temporary, path);
  }

  private upload(profileId: string, uploadId: string): Upload {
    const upload = this.uploads.get(uploadId);
    if (upload?.profileId !== profileId || upload.expiresAt <= this.options.now().getTime()) {
      throw new ApiError('not_found', 'This upload is not open; start it again.');
    }
    return upload;
  }

  private partPath(uploadId: string): string {
    return join(this.options.layout.tmp, `upload-${uploadId}.part`);
  }

  private async forgetStale(): Promise<void> {
    const now = this.options.now().getTime();
    const expired = [...this.uploads.values()].filter((upload) => upload.expiresAt <= now);
    expired.forEach((upload) => this.uploads.delete(upload.id));
    await Promise.all(expired.map((upload) => rm(this.partPath(upload.id), { force: true })));
    const stale = this.options.chat.unattachedBefore(
      new Date(now - UNATTACHED_KEPT_MS).toISOString(),
    );
    await this.discardUnattached(stale.filter((file) => !this.preparing.has(file.id)));
  }
}
