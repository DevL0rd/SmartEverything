import {
  ApiError,
  CommandRefusedError,
  type ApiErrorCode,
  type ErrorClass,
  type NodeFailureCode,
} from '@smarteverything/domain';
import type { NodeResult } from '@smarteverything/flow/interpret/frames';
import { failureLine } from '@smarteverything/logging';
import { TelevisionDidNotWakeError, WakePacketsFailedError } from '../commands/television-wake';
import {
  ComputerCommandUnsupportedError,
  ComputerOfflineError,
  ComputerScopeOffError,
  NotAComputerError,
} from '../computers/computer-errors';
import { NodeCallError } from '../computers/node-calls';
import { CommandNotConfirmedError } from './effects/command-confirm';
import { EffectBudgetExceededError } from './effects/effect-budget';
import { HttpEffectError } from './effects/http';
import { IntegrationError } from './effects/integration-error';
import { AutomationRunCancelledError } from './effects/run-abort';
import { UnknownSceneError } from './effects/scene';

export type EffectFailureResult = Extract<NodeResult, { readonly ok: false }> & {
  readonly code?: string;
};

interface Classified {
  readonly class: ErrorClass;
  readonly code?: string;
  readonly message?: string;
}

type Classifier = (cause: unknown) => Classified | undefined;

const API_CLASSES: Readonly<Record<ApiErrorCode, ErrorClass>> = {
  invalid_request: 'Invalid',
  unauthorized: 'Forbidden',
  forbidden: 'Forbidden',
  ownership_lost: 'Failed',
  not_found: 'NotFound',
  method_not_allowed: 'Invalid',
  conflict: 'Failed',
  link_expired: 'Failed',
  payload_too_large: 'LimitExceeded',
  unsupported_media_type: 'Invalid',
  command_refused: 'Refused',
  pairing_code_invalid: 'Invalid',
  public_url_not_verified: 'Failed',
  rate_limited: 'LimitExceeded',
  internal: 'Failed',
  upstream_failed: 'Failed',
  camera_unavailable: 'Unreachable',
  camera_offline: 'Unreachable',
  camera_privacy_on: 'Refused',
  firewall_blocked: 'Unreachable',
  camera_busy: 'LimitExceeded',
  claude_not_ready: 'Unreachable',
  computer_update_required: 'Refused',
};

const NODE_CLASSES: Readonly<Record<NodeFailureCode, ErrorClass>> = {
  scope_off: 'Forbidden',
  not_supported: 'Refused',
  not_permitted: 'Forbidden',
  blocked: 'Refused',
  not_found: 'NotFound',
  not_own: 'Forbidden',
  no_session: 'Refused',
  failed: 'Failed',
};

function when<T extends Error>(
  type: abstract new (...args: never[]) => T,
  classify: (cause: T) => Classified | undefined,
): Classifier {
  return (cause) => (cause instanceof type ? classify(cause) : undefined);
}

const CLASSIFIERS: readonly Classifier[] = [
  when(HttpEffectError, (cause) => ({ class: cause.kind, message: cause.message })),
  when(IntegrationError, (cause) => ({
    class: cause.kind,
    message: cause.message,
    ...(cause.code === undefined ? {} : { code: cause.code }),
  })),
  when(ApiError, (cause) => ({ class: API_CLASSES[cause.code], code: cause.code })),
  when(NodeCallError, (cause) => ({ class: NODE_CLASSES[cause.code], code: cause.code })),
  when(CommandRefusedError, () => ({ class: 'Refused', code: 'command_refused' })),
  when(CommandNotConfirmedError, (cause) => ({
    class: 'Timeout',
    code: 'not_confirmed',
    message: cause.message,
  })),
  when(TelevisionDidNotWakeError, () => ({ class: 'Timeout', code: 'did_not_wake' })),
  when(WakePacketsFailedError, () => ({ class: 'Unreachable', code: 'wake_failed' })),
  when(ComputerOfflineError, () => ({ class: 'Unreachable', code: 'offline' })),
  when(NotAComputerError, () => ({ class: 'NotFound', code: 'not_a_computer' })),
  when(ComputerScopeOffError, () => ({ class: 'Forbidden', code: 'scope_off' })),
  when(ComputerCommandUnsupportedError, () => ({ class: 'Refused', code: 'not_supported' })),
  when(EffectBudgetExceededError, () => ({ class: 'LimitExceeded', code: 'effect_budget' })),
  when(UnknownSceneError, () => ({ class: 'NotFound', code: 'unknown_scene' })),
  when(Error, (cause) => (cause.name === 'TimeoutError' ? { class: 'Timeout' } : undefined)),
];

function classify(cause: unknown): Classified {
  for (const classifier of CLASSIFIERS) {
    const found = classifier(cause);
    if (found !== undefined) return found;
  }
  return { class: 'Failed' };
}

export function effectFailure(cause: unknown): EffectFailureResult {
  if (cause instanceof AutomationRunCancelledError) throw cause;
  const found = classify(cause);
  return {
    ok: false,
    class: found.class,
    message: found.message ?? failureLine(cause),
    ...(found.code === undefined ? {} : { code: found.code }),
  };
}
