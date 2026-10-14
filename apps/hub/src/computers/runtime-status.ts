import {
  COMPUTER_RUNTIME_TARGET,
  type ComputerAiRuntime,
  type ComputerRuntimeCapabilities,
  type ComputerRuntimeTarget,
} from '@smarteverything/domain';
import { z } from 'zod';
export function unavailableRuntime(runtime: ComputerAiRuntime): ComputerRuntimeCapabilities {
  return {
    runtime_version: null,
    capability_revision: 'unreported',
    operations: [],
    settings: [],
    control_reason: `This computer has not reported its ${runtime} control capabilities.`,
    provider_reason: `This computer has not reported its ${runtime} provider capabilities.`,
    authentication: 'unknown',
    subscription: 'unverified',
    input_modalities: [],
    local_features: {},
  };
}

const RUNTIME_KEY = z.tuple([z.uuid(), z.enum(['claude', 'codex'])]);
export function runtimeTargetOfKey(key: string): ComputerRuntimeTarget {
  const parsed: unknown = JSON.parse(key);
  const tuple = RUNTIME_KEY.parse(parsed);
  return COMPUTER_RUNTIME_TARGET.parse({ device_id: tuple[0], runtime: tuple[1] });
}
