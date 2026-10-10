import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { GoogleGenAI, type UsageMetadata } from '@google/genai';
import type { Logger } from '@smarteverything/logging';
import { MissingGeminiKeyError } from '../assistant-voice/gemini';
import { recordTranscription, type PriceBook } from '../ledger/gemini-live';
import type { Ledger } from '../ledger/ledger';
import type {
  AssistantChatRepository,
  StoredAttachment,
} from '../store/repositories/assistant-chat';
import { transcribeModel } from './transcriber';

export type MediaKind = 'audio' | 'video' | 'image';

const TIMEOUT_MS = 90_000;
const MAX_ANSWER_TOKENS = 2048;
const INLINE_BYTES_MAX = 18 * 1024 * 1024;
const NOTE_CHARACTERS_MAX = 8000;
const NO_SPEECH = 'NO_SPEECH';
const SILENT_NOTE = '(no speech)';

const PROMPTS: Readonly<Record<MediaKind, string>> = {
  audio: `Transcribe the speech in this audio word for word, in the language spoken. Answer with the words only: no timestamps, labels or comments. If there is no speech, answer with a bracketed description of the sound in at most 12 words, or exactly ${NO_SPEECH} when it is only silence or noise.`,
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
  readonly usage: UsageMetadata | null;
}

export interface MediaNoteProvider {
  readonly describe: (input: MediaNoteInput) => Promise<MediaNoteAnswer>;
}

export class GeminiMediaNotes implements MediaNoteProvider {
  constructor(private readonly key: () => string | null) {}

  async describe(input: MediaNoteInput): Promise<MediaNoteAnswer> {
    const apiKey = this.key();
    if (apiKey === null) {
      throw new MissingGeminiKeyError();
    }
    const response = await new GoogleGenAI({ apiKey }).models.generateContent({
      model: input.model,
      contents: [
        {
          role: 'user',
          parts: [
            { text: input.prompt },
            { inlineData: { mimeType: input.mime, data: input.data.toString('base64') } },
          ],
        },
      ],
      config: {
        temperature: 0,
        maxOutputTokens: MAX_ANSWER_TOKENS,
        httpOptions: { timeout: TIMEOUT_MS },
      },
    });
    return { text: response.text ?? '', usage: response.usageMetadata ?? null };
  }
}

export class MediaTooLargeError extends Error {
  override readonly name = 'MediaTooLargeError';

  constructor(name: string, bytes: number) {
    super(
      `${name} is ${String(bytes)} bytes; at most ${String(INLINE_BYTES_MAX)} can be transcribed.`,
    );
  }
}

class MediaUsageMissingError extends Error {
  override readonly name = 'MediaUsageMissingError';

  constructor(model: string) {
    super(`Gemini answered ${model} without saying how much it used, so the cost is unknown.`);
  }
}

export function mediaKindOf(mime: string): MediaKind | null {
  const [type] = mime.split('/');
  return type === 'audio' || type === 'video' || type === 'image' ? type : null;
}

function noteOf(kind: MediaKind, answer: string): string {
  const text = answer.trim();
  if (text === '' || text.toUpperCase() === NO_SPEECH) {
    return kind === 'image' ? '(no description)' : SILENT_NOTE;
  }
  return text.slice(0, NOTE_CHARACTERS_MAX);
}

export interface MediaNotesOptions {
  readonly provider: MediaNoteProvider;
  readonly chat: AssistantChatRepository;
  readonly ledger: Ledger;
  readonly prices: PriceBook;
  readonly filesRoot: string;
  readonly log: Logger;
}

export class MediaNotes {
  private readonly model = transcribeModel();
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
    this.ensure(file).catch((cause: unknown) => {
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
    const answer = await this.options.provider.describe({
      model: this.model,
      prompt: PROMPTS[kind],
      mime: file.mime,
      data,
    });
    this.record(file, kind, answer);
    const note = noteOf(kind, answer.text);
    this.options.chat.setTranscript(file.id, note);
    return note;
  }

  private record(file: StoredAttachment, kind: MediaKind, answer: MediaNoteAnswer): void {
    try {
      if (answer.usage === null) {
        throw new MediaUsageMissingError(this.model);
      }
      recordTranscription(this.options.ledger, this.options.prices, {
        profileId: file.profile_id,
        messageId: file.message_id,
        pluginId: null,
        model: this.model,
        usage: answer.usage,
        meta: { attachment_id: file.id, message_id: file.message_id, media: kind },
      });
    } catch (cause) {
      this.options.log.error('assistant.media_usage_unrecorded', cause, { attachmentId: file.id });
    }
  }
}
