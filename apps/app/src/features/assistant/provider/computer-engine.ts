import type { ComputerAiRuntime, Engine } from '@smarteverything/domain';

export type ComputerEngine = Extract<Engine, { readonly kind: ComputerAiRuntime }>;

export const COMPUTER_ENGINE_LABELS = {
  claude: { name: 'Claude', provider: 'anthropic', subscription: 'Claude subscription' },
  codex: { name: 'Codex', provider: 'openai', subscription: 'Codex subscription' },
} as const;

export function isComputerEngine(engine: Engine): engine is ComputerEngine {
  return engine.kind === 'claude' || engine.kind === 'codex';
}

export function nativeModelKey(runtime: ComputerAiRuntime, model: string): string {
  return JSON.stringify([runtime, model]);
}
