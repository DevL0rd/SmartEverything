import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  ApiError,
  GEMINI_KEY,
  GEMINI_KEY_SOURCES,
  type AssistantVoiceStatus,
  type GeminiKeySource,
} from '@smarteverything/domain';
import type { SecretStore } from '../secrets/store';

const MODELS_URL = 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1';
const CHECK_TIMEOUT_MS = 15_000;
const ENV_LINE = /^GEMINI_API_KEY=(.*)$/m;

function envFileOf(source: GeminiKeySource): string {
  return join(homedir(), '.local', 'share', source, '.env');
}

async function keyIn(source: GeminiKeySource): Promise<string | null> {
  const text = await readFile(envFileOf(source), 'utf8').catch((cause: unknown) => {
    if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') {
      return '';
    }
    throw cause;
  });
  const raw = ENV_LINE.exec(text)?.[1]?.trim().replace(/^"|"$/g, '');
  const parsed = GEMINI_KEY.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export class GeminiKeys {
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly secrets: SecretStore,
    private readonly fetcher: typeof fetch,
  ) {}

  current(): string | null {
    return this.secrets.read().geminiKey;
  }

  changes(listener: () => void): () => void {
    this.listeners.add(listener);
    return (): void => {
      this.listeners.delete(listener);
    };
  }

  async status(): Promise<AssistantVoiceStatus> {
    const found = await Promise.all(
      GEMINI_KEY_SOURCES.map(async (source) => ((await keyIn(source)) === null ? null : source)),
    );
    return {
      key: this.current() === null ? 'missing' : 'set',
      sources: found.filter((source): source is GeminiKeySource => source !== null),
    };
  }

  async importFrom(source: GeminiKeySource): Promise<AssistantVoiceStatus> {
    const key = await keyIn(source);
    if (key === null) {
      throw new ApiError('not_found', `There is no Gemini key in ${source} on this computer.`);
    }
    return this.save(key);
  }

  async save(key: string): Promise<AssistantVoiceStatus> {
    await this.check(key);
    await this.secrets.update((secrets) => ({ ...secrets, geminiKey: key }));
    this.changed();
    return this.status();
  }

  async remove(): Promise<AssistantVoiceStatus> {
    await this.secrets.update((secrets) => ({ ...secrets, geminiKey: null }));
    this.changed();
    return this.status();
  }

  private changed(): void {
    this.listeners.forEach((listener) => {
      listener();
    });
  }

  private async check(key: string): Promise<void> {
    const response = await this.fetcher(MODELS_URL, {
      headers: { 'x-goog-api-key': key },
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new ApiError(
        'invalid_request',
        `Google did not accept this Gemini key (HTTP ${String(response.status)}).`,
      );
    }
  }
}
