import {
  ApiError,
  type Provider,
  type ProviderProblem,
  type ProviderPrompt,
} from '@smarteverything/domain';
import type { ShownPrompt } from '../adapters/contract';
import type { HubDatabase } from '../database/port';

interface Pending {
  readonly resolve: (answer: string) => void;
  readonly reject: (cause: unknown) => void;
}

class PromptReplacedError extends Error {
  override readonly name = 'PromptReplacedError';
  readonly problem: ProviderProblem = 'cancelled';

  constructor(provider: Provider) {
    super(`The question for ${provider} was replaced by a newer one before it was answered.`);
  }
}

class PromptCancelledError extends Error {
  override readonly name = 'PromptCancelledError';
  readonly problem: ProviderProblem = 'cancelled';

  constructor(provider: Provider) {
    super(`The question for ${provider} was withdrawn because ${provider} stopped.`);
  }
}

class PromptDismissedError extends Error {
  override readonly name = 'PromptDismissedError';
  readonly problem: ProviderProblem = 'cancelled';

  constructor(provider: Provider) {
    super(`The question for ${provider} was taken down because it is no longer needed.`);
  }
}

export class PromptBroker {
  private readonly pending = new Map<Provider, Pending>();

  constructor(private readonly store: Pick<HubDatabase, 'updateProviderLink'>) {}

  async ask(provider: Provider, prompt: ProviderPrompt): Promise<string> {
    return (await this.show(provider, prompt)).answer;
  }

  async show(provider: Provider, prompt: ProviderPrompt): Promise<ShownPrompt> {
    this.pending.get(provider)?.reject(new PromptReplacedError(provider));
    let entry: Pending | null = null;
    const answer = new Promise<string>((resolve, reject) => {
      entry = { resolve, reject };
      this.pending.set(provider, entry);
    });
    await this.store.updateProviderLink(provider, { prompt, phase: 'awaiting_answer' });
    return {
      answer,
      dismiss: async (): Promise<void> => {
        if (entry !== null && this.pending.get(provider) === entry) {
          this.pending.delete(provider);
          entry.reject(new PromptDismissedError(provider));
          await this.store.updateProviderLink(provider, { prompt: null, phase: 'signing_in' });
        }
      },
    };
  }

  async answer(provider: Provider, answer: string): Promise<void> {
    const pending = this.pending.get(provider);
    if (pending === undefined) {
      throw new ApiError(
        'conflict',
        `An answer arrived for ${provider}, but ${provider} is not waiting for one.`,
      );
    }
    this.pending.delete(provider);
    await this.store.updateProviderLink(provider, { prompt: null, phase: 'signing_in' });
    pending.resolve(answer);
  }

  cancel(provider: Provider): void {
    this.pending.get(provider)?.reject(new PromptCancelledError(provider));
    this.pending.delete(provider);
  }

  cancelAll(): void {
    for (const provider of [...this.pending.keys()]) {
      this.cancel(provider);
    }
  }
}
