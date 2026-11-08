import type { Engine } from './ai-chats';
import type { ComputerRuntimeModel } from './computer-ai-runtime';

type NativeModelOptions = Pick<
  ComputerRuntimeModel,
  'efforts' | 'service_tiers' | 'adaptive_thinking' | 'fast'
>;

export function nativeModelOptionReason(
  engine: Extract<Engine, { kind: 'claude' | 'codex' }>,
  model: NativeModelOptions,
): string | null {
  if (engine.effort !== null && !model.efforts.includes(engine.effort))
    return 'The selected model does not support this effort.';
  if (engine.kind === 'codex') {
    return engine.settings.service_tier !== undefined &&
      model.service_tiers?.includes(engine.settings.service_tier) !== true
      ? 'This model has not reported the requested service tier.'
      : null;
  }
  return claudeModelOptionReason(engine.settings, model);
}

function claudeModelOptionReason(
  settings: Extract<Engine, { kind: 'claude' }>['settings'],
  model: NativeModelOptions,
): string | null {
  if (settings.thinking === 'adaptive' && !model.adaptive_thinking)
    return 'The model does not support adaptive thinking.';
  if (settings.fast === true && !model.fast) return 'The model does not support fast mode.';
  return null;
}
