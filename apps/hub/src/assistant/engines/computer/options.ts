import { ApiError, type ComputerRuntimeSettings } from '@smarteverything/domain';
import type { ComputerEngine } from '../../engine-kind';

type ClaudeEngine = Extract<ComputerEngine, { kind: 'claude' }>;
type CodexEngine = Extract<ComputerEngine, { kind: 'codex' }>;

export function effectiveProviderEngine(
  engine: ClaudeEngine,
  settings: ComputerRuntimeSettings,
): ClaudeEngine;
export function effectiveProviderEngine(
  engine: CodexEngine,
  settings: ComputerRuntimeSettings,
): CodexEngine;
export function effectiveProviderEngine(
  engine: ComputerEngine,
  settings: ComputerRuntimeSettings,
): ComputerEngine;
export function effectiveProviderEngine(
  engine: ComputerEngine,
  settings: ComputerRuntimeSettings,
): ComputerEngine {
  if (engine.kind === 'claude' && settings.runtime === 'claude')
    return { ...engine, settings: { ...settings.settings.provider.options, ...engine.settings } };
  if (engine.kind === 'codex' && settings.runtime === 'codex')
    return { ...engine, settings: { ...settings.settings.provider.options, ...engine.settings } };
  throw new ApiError('conflict', 'The native configuration belongs to another runtime.');
}
