import {
  GoogleGenAI,
  MediaModality,
  Modality,
  type GenerateContentParameters,
  type GenerateContentResponse,
  type SpeechConfig,
} from '@google/genai';
import { Logger } from '@smarteverything/logging';
import { MissingGeminiKeyError } from '../assistant-voice/gemini';
import type { SpeechChunk, SpeechOptions, SpeechProvider, SpeechUsage } from './speech-provider';

const log = new Logger('hub.speech');

class SpeechNotReturnedError extends Error {
  override readonly name = 'SpeechNotReturnedError';

  constructor(model: string) {
    super(`${model} returned no audio for this text.`);
  }
}

function pcmOf(base64: string): Int16Array {
  const bytes = Buffer.from(base64, 'base64');
  return new Int16Array(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength - (bytes.length % 2)),
  );
}

function audioTokensOf(response: GenerateContentResponse): number {
  const usage = response.usageMetadata;
  const audio = (usage?.candidatesTokensDetails ?? [])
    .filter((detail) => detail.modality === MediaModality.AUDIO)
    .reduce((total, detail) => total + (detail.tokenCount ?? 0), 0);
  return audio > 0 ? audio : (usage?.candidatesTokenCount ?? 0);
}

function audioOf(response: GenerateContentResponse): Int16Array[] {
  const parts = response.candidates?.[0]?.content?.parts ?? [];
  return parts.flatMap((part) =>
    part.inlineData?.data === undefined ? [] : [pcmOf(part.inlineData.data)],
  );
}

function usageOf(response: GenerateContentResponse): SpeechUsage {
  return {
    inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
    audioTokens: audioTokensOf(response),
  };
}

export function speechConfigOf(voice: string): SpeechConfig {
  return { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } };
}

function speechRequestOf(options: SpeechOptions): GenerateContentParameters {
  return {
    model: options.model,
    contents: options.text,
    config: {
      abortSignal: options.signal,
      responseModalities: [Modality.AUDIO],
      speechConfig: speechConfigOf(options.voice),
    },
  };
}

export class GeminiSpeech implements SpeechProvider {
  constructor(private readonly key: () => string | null) {}

  async *synthesize(options: SpeechOptions): AsyncGenerator<SpeechChunk> {
    const apiKey = this.key();
    if (apiKey === null) {
      throw new MissingGeminiKeyError();
    }
    const ai = new GoogleGenAI({ apiKey });
    const startedAt = performance.now();
    log.debug('synthesis.requesting', {
      model: options.model,
      voice: options.voice,
      textChars: options.text.length,
    });
    const stream = await ai.models.generateContentStream(speechRequestOf(options));
    log.debug('synthesis.streaming', () => ({
      model: options.model,
      headersMs: Math.round(performance.now() - startedAt),
    }));
    let last: GenerateContentResponse | null = null;
    let spoke = false;
    let responses = 0;
    for await (const response of stream) {
      last = response;
      responses += 1;
      for (const pcm of audioOf(response)) {
        if (!spoke) {
          log.debug('synthesis.first_audio', () => ({
            model: options.model,
            firstAudioMs: Math.round(performance.now() - startedAt),
          }));
        }
        spoke = true;
        yield { kind: 'audio', pcm };
      }
    }
    if (!spoke || last === null) {
      log.warn('synthesis.silent', {
        model: options.model,
        responses,
        durationMs: Math.round(performance.now() - startedAt),
      });
      throw new SpeechNotReturnedError(options.model);
    }
    log.debug('synthesis.finished', () => ({
      model: options.model,
      responses,
      durationMs: Math.round(performance.now() - startedAt),
    }));
    yield { kind: 'usage', usage: usageOf(last) };
  }
}
