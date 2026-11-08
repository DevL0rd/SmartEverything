import { latestGeminiFlashLite, type AiModelRow } from '@smarteverything/domain';
import type { Catalogue } from '../openrouter/catalogue';

export interface SidePrompt {
  readonly system: string;
  readonly input: string;
}

export interface AuxCompletionInput extends SidePrompt {
  readonly chatId: string;
  readonly model: string;
  readonly purpose?: 'session-title';
  readonly sessionKey?: string;
}

export interface AuxCompletionPort {
  readonly complete: (input: AuxCompletionInput, signal?: AbortSignal) => Promise<string>;
}

export interface SideParts {
  readonly completions: AuxCompletionPort;
  readonly catalogue: Pick<Catalogue, 'rows' | 'onChange'>;
}

export interface SideRequest extends SidePrompt {
  readonly chatId: string;
  readonly purpose?: 'session-title';
}

export class SideCompletion {
  constructor(private readonly parts: SideParts) {}

  model(): AiModelRow | null {
    return latestGeminiFlashLite(this.parts.catalogue.rows('chat'));
  }

  onModels(listener: () => void): () => void {
    return this.parts.catalogue.onChange(listener);
  }

  complete(model: AiModelRow, request: SideRequest): Promise<string> {
    return this.parts.completions.complete({ ...request, model: model.id });
  }
}
