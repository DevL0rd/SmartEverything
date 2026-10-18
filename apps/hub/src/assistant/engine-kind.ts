import type { Engine } from '@smarteverything/domain';

export type ComputerEngine = Extract<Engine, { kind: 'claude' | 'codex' }>;

export function computerEngine(engine: Engine): ComputerEngine | null {
  return engine.kind === 'claude' || engine.kind === 'codex' ? engine : null;
}
