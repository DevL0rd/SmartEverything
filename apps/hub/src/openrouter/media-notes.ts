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

const TIMEOUT_MS = 90_000;
const INPUT_BYTES_MAX = 18 * 1024 * 1024;
const RESPONSE_BYTES_MAX = 256 * 1024;
const MAX_ANSWER_TOKENS = 2048;

const ANSWER = z.object({
  id: z.string().min(1).max(200),
  choices: z.array(z.object({ message: z.object({ content: z.string().nullable() }) })).length(1),
  usage: OR_USAGE.extend({ cost: z.number().nonnegative().nullish() }).nullish(),
});

function mediaPart(input: MediaNoteInput): ContentPart {
  const url = `data:${input.mime};base64,${input.data.toString('base64')}`;
  if (input.mime.startsWith('image/')) return { type: 'image_url', image_url: { url } };
  if (input.mime.startsWith('video/')) return { type: 'video_url', video_url: { url } };
  throw openRouterError('bad_request', `unsupported caption media type ${input.mime}`);
}

export class OpenRouterMediaNotes implements MediaNoteProvider {
  constructor(private readonly client: OpenRouterClient) {}

  async describe(input: MediaNoteInput): Promise<MediaNoteAnswer> {
    if (input.data.byteLength > INPUT_BYTES_MAX)
      throw openRouterError('bad_request', 'caption media exceeds the 18 MiB limit');
    const answer = await this.client.json(
      {
        path: '/chat/completions',
        method: 'POST',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        responseBytesMax: RESPONSE_BYTES_MAX,
        body: {
          model: input.model,
          messages: [
            { role: 'user', content: [{ type: 'text', text: input.prompt }, mediaPart(input)] },
          ],
          stream: false,
          usage: { include: true },
          temperature: 0,
          max_tokens: MAX_ANSWER_TOKENS,
          reasoning: { enabled: false },
          provider: { allow_fallbacks: false },
        },
      },
      ANSWER,
      'media caption',
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
