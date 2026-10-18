import { z } from 'zod';
import type {
  MediaNoteAnswer,
  MediaNoteInput,
  MediaNoteProvider,
} from '../transcripts/media-notes';
import type { ContentPart } from './chat-types';
import type { OpenRouterClient } from './client';
import { openRouterError } from './errors';
import { OR_USAGE } from './wire';
import { REQUEST_BYTES_MAX, requestTimeoutMs, shrinkMedia } from './media-shrink';

const RESPONSE_BYTES_MAX = 256 * 1024;
const MAX_ANSWER_TOKENS = 2048;

const ANSWER = z.object({
  id: z.string().min(1).max(200),
  choices: z.array(z.object({ message: z.object({ content: z.string().nullable() }) })).length(1),
  usage: OR_USAGE.extend({ cost: z.number().nonnegative().nullish() }).nullish(),
});

function mediaPart(media: { readonly mime: string; readonly data: Buffer }): ContentPart {
  const url = `data:${media.mime};base64,${media.data.toString('base64')}`;
  if (media.mime.startsWith('image/')) return { type: 'image_url', image_url: { url } };
  if (media.mime.startsWith('video/')) return { type: 'video_url', video_url: { url } };
  throw openRouterError('bad_request', `unsupported caption media type ${media.mime}`);
}

async function requestMedia(
  input: MediaNoteInput,
  limit: number,
): Promise<{ readonly mime: string; readonly data: Buffer }> {
  if (input.data.byteLength <= limit) return input;
  const smaller = await shrinkMedia(input.data, input.mime, limit);
  if (smaller === undefined)
    throw openRouterError('bad_request', 'caption media is too large to describe in one request');
  return smaller;
}

export class OpenRouterMediaNotes implements MediaNoteProvider {
  constructor(
    private readonly client: OpenRouterClient,
    private readonly requestBytesMax: number = REQUEST_BYTES_MAX,
  ) {}

  async describe(input: MediaNoteInput): Promise<MediaNoteAnswer> {
    const media = await requestMedia(input, this.requestBytesMax);
    const body = {
      model: input.model,
      messages: [
        { role: 'user', content: [{ type: 'text', text: input.prompt }, mediaPart(media)] },
      ],
      stream: false,
      usage: { include: true },
      temperature: 0,
      max_tokens: MAX_ANSWER_TOKENS,
      reasoning: { enabled: false },
      provider: { allow_fallbacks: false },
    };
    const answer = await this.client.retrying((signal) =>
      this.client.json(
        {
          path: '/chat/completions',
          method: 'POST',
          signal: AbortSignal.any([
            signal,
            AbortSignal.timeout(requestTimeoutMs(media.data.byteLength)),
          ]),
          responseBytesMax: RESPONSE_BYTES_MAX,
          body,
        },
        ANSWER,
        'media caption',
      ),
    );
    const [choice] = answer.choices;
    if (choice === undefined) throw openRouterError('unreadable', 'caption response has no choice');
    return {
      text: choice.message.content ?? '',
      usage: answer.usage ?? null,
      generationId: answer.id,
    };
  }
}
