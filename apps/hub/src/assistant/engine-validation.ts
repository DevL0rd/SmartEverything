import {
  ApiError,
  type ComputerRuntimeModel,
  type Engine,
  type Role,
} from '@smarteverything/domain';
import type { ComputerEngine } from './engine-kind';
import type { ComputerAiDirectory } from '../computers/ai-directory';
import type { Store } from '../store/store';
export function validateComputerEngine(
  store: Store,
  directory: ComputerAiDirectory,
  engine: ComputerEngine,
  role: Role,
): void {
  if (role !== 'owner')
    throw new ApiError('forbidden', 'Only the home owner can use Claude or Codex on computers.');
  const target = { device_id: engine.device_id, runtime: engine.kind };
  const status = directory.runtimeStatus(target);
  if (!status.settings.settings.provider.enabled)
    throw new ApiError(
      'claude_not_ready',
      `The ${engine.kind} provider is disabled on this computer.`,
    );
  const model = store.computerRuntimes
    .models(target)
    .find((row) => row.id === engine.model || row.resolved_model === engine.model);
  if (model === undefined)
    throw new ApiError(
      'invalid_request',
      'This model has not been discovered on the selected supplying computer.',
    );
  if (status.online && !model.available)
    throw new ApiError(
      'claude_not_ready',
      model.reason ?? 'This model is unavailable on the selected computer.',
    );
  validateModelOptions(engine, model);
}
function validateModelOptions(engine: ComputerEngine, model: ComputerRuntimeModel): void {
  if (engine.effort !== null && !model.efforts.includes(engine.effort))
    throw new ApiError('invalid_request', 'The selected model does not support this effort.');
  if (engine.kind === 'codex') {
    if (
      engine.settings.service_tier !== undefined &&
      model.service_tiers?.includes(engine.settings.service_tier) !== true
    )
      throw new ApiError(
        'invalid_request',
        'This model has not reported the requested service tier.',
      );
    return;
  }
  validateClaudeOptions(engine, model);
}
function validateClaudeOptions(
  engine: Extract<Engine, { kind: 'claude' }>,
  model: ComputerRuntimeModel,
): void {
  if (engine.settings.thinking === 'adaptive' && !model.adaptive_thinking)
    throw new ApiError('invalid_request', 'The model does not support adaptive thinking.');
  if (engine.settings.fast === true && !model.fast)
    throw new ApiError('invalid_request', 'The model does not support fast mode.');
}
