import { ApiError } from '@smarteverything/domain';
import type { SecretStore } from '../secrets/store';
import type { OpenRouterClient } from './client';
import { OpenRouterError } from './errors';

export class OpenRouterKeys {
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly secrets: SecretStore,
    private readonly client: OpenRouterClient,
  ) {}

  current(): string | null {
    return this.secrets.read().openrouterKey;
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async save(key: string): Promise<void> {
    await this.check(key);
    await this.secrets.update((secrets) => ({ ...secrets, openrouterKey: key }));
    this.changed();
  }

  async remove(): Promise<void> {
    await this.secrets.update((secrets) => ({ ...secrets, openrouterKey: null }));
    this.changed();
  }

  private changed(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  private async check(key: string): Promise<void> {
    try {
      await this.client.key(key);
    } catch (cause) {
      if (cause instanceof OpenRouterError && cause.code === 'unauthorized') {
        throw new ApiError('invalid_request', 'OpenRouter didn’t accept this key.');
      }
      throw cause;
    }
  }
}
