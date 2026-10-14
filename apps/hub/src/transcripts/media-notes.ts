import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Logger } from '@smarteverything/logging';
import { OPENROUTER_MEDIA_NOTES_MODEL } from '@smarteverything/domain';
import { recordAudioTranscription } from '../ledger/transcription';
import { transcriptionFormat, type TranscriptionProvider } from '../openrouter/transcription';
import { recordMediaNote } from '../ledger/media-notes';
import type { OrUsage } from '../openrouter/wire';
import type { Ledger } from '../ledger/ledger';
import type {
  AssistantChatRepository,
  StoredAttachment,
} from '../store/repositories/assistant-chat';
import { transcribeModel } from './transcriber';

export type MediaKind = 'audio' | 'video' | 'image';

const INLINE_BYTES_MAX = 18 * 1024 * 1024;
const NOTE_CHARACTERS_MAX = 8000;
const NO_SPEECH = 'NO_SPEECH';
const SILENT_NOTE = '(no speech)';

const PROMPTS: Readonly<Record<Exclude<MediaKind, 'audio'>, string>> = {
  video: `Transcribe any speech in this video word for word, in the language spoken. Then, on a new line starting with "Visual:", describe what the video shows in at most 60 words. If there is no speech, give only the Visual line.`,
  image:
    'Describe this image for someone who cannot see it, in at most 80 words. Include any readable text verbatim.',
};

export interface MediaNoteInput {
  readonly model: string;
  readonly prompt: string;
  readonly mime: string;
  readonly data: Buffer;
}

export interface MediaNoteAnswer {
  readonly text: string;
  readonly usage: OrUsage | null;
  readonly generationId?: string;
}

export interface MediaNoteProvider {
  readonly describe: (input: MediaNoteInput) => Promise<MediaNoteAnswer>;
}

export class MediaTooLargeError extends Error {
  override readonly name = 'MediaTooLargeError';

  constructor(name: string, bytes: number) {
    super(
      `${name} is ${String(bytes)} bytes; at most ${String(INLINE_BYTES_MAX)} can be transcribed.`,
    );
  }
}

export class MissingMediaNoteError extends Error {
  override readonly name = 'MissingMediaNoteError';

  constructor(kind: MediaKind) {
    super(`The ${kind} caption provider returned no description; the media note was not saved.`);
  }
}

export function mediaKindOf(mime: string): MediaKind | null {
  const [type] = mime.split('/');
  return type === 'audio' || type === 'video' || type === 'image' ? type : null;
}

function noteOf(kind: MediaKind, answer: string): string {
  const text = answer.trim();
  if (text === '' || text.toUpperCase() === NO_SPEECH) {
    if (kind !== 'audio') throw new MissingMediaNoteError(kind);
    return SILENT_NOTE;
  }
  return text.slice(0, NOTE_CHARACTERS_MAX);
}

export interface MediaNotesOptions {
  readonly provider: MediaNoteProvider;
  readonly transcriptionProvider: TranscriptionProvider;
  readonly chat: AssistantChatRepository;
  readonly ledger: Ledger;
  readonly filesRoot: string;
  readonly log: Logger;
}

export class MediaNotes {
  private readonly model = OPENROUTER_MEDIA_NOTES_MODEL;
  private readonly running = new Map<string, Promise<string>>();

  constructor(private readonly options: MediaNotesOptions) {}

  ensure(file: StoredAttachment): Promise<string> {
    if (file.transcript !== null) {
      return Promise.resolve(file.transcript);
    }
    const stored = this.options.chat.attachment(file.id);
    if (stored.transcript !== null) {
      return Promise.resolve(stored.transcript);
    }
    const found = this.running.get(file.id);
    if (found !== undefined) {
      return found;
    }
    const started = this.generate(stored).finally(() => {
      this.running.delete(file.id);
    });
    this.running.set(file.id, started);
    return started;
  }

  later(file: StoredAttachment): void {
    void Promise.resolve()
      .then(() => this.ensure(file))
      .catch((cause: unknown) => {
        this.options.log.error('assistant.media_note_failed', cause, { attachmentId: file.id });
      });
  }

  private async generate(file: StoredAttachment): Promise<string> {
    const kind = mediaKindOf(file.mime);
    if (kind === null) {
      throw new Error(`${file.name} (${file.mime}) is not audio, video or an image.`);
    }
    if (file.bytes > INLINE_BYTES_MAX) {
      throw new MediaTooLargeError(file.name, file.bytes);
    }
    const data = await readFile(join(this.options.filesRoot, file.storage_path));
    if (data.byteLength > INLINE_BYTES_MAX) {
      throw new MediaTooLargeError(file.name, data.byteLength);
    }
    const text =
      kind === 'audio' ? await this.transcribe(file, data) : await this.describe(file, kind, data);
    const note = noteOf(kind, text);
    this.options.chat.setTranscript(file.id, note);
    return note;
  }

  private async transcribe(file: StoredAttachment, data: Buffer): Promise<string> {
    const model = transcribeModel();
    const answer = await this.options.transcriptionProvider.transcribe({
      model,
      data,
      format: transcriptionFormat(file.mime),
    });
    try {
      recordAudioTranscription(this.options.ledger, {
        profileId: file.profile_id,
        messageId: file.message_id,
        pluginId: null,
        model,
        answer,
        meta: { attachment_id: file.id, message_id: file.message_id, media: 'audio' },
      });
    } catch (cause) {
      this.options.log.error('assistant.media_usage_unrecorded', cause, { attachmentId: file.id });
    }
    return answer.text;
  }

  private async describe(
    file: StoredAttachment,
    kind: Exclude<MediaKind, 'audio'>,
    data: Buffer,
  ): Promise<string> {
    const answer = await this.options.provider.describe({
      model: this.model,
      prompt: PROMPTS[kind],
      mime: file.mime,
      data,
    });
    this.record(file, kind, answer);
    return answer.text;
  }

  private record(file: StoredAttachment, kind: MediaKind, answer: MediaNoteAnswer): void {
    try {
      recordMediaNote(this.options.ledger, {
        profileId: file.profile_id,
        messageId: file.message_id,
        pluginId: null,
        model: this.model,
        answer,
        meta: { attachment_id: file.id, message_id: file.message_id, media: kind },
      });
    } catch (cause) {
      this.options.log.error('assistant.media_usage_unrecorded', cause, { attachmentId: file.id });
    }
  }
}
