import { ApiError } from '@smarteverything/domain';
import type { NodeResult } from '@smarteverything/flow/interpret/frames';
import { failureLine } from '@smarteverything/logging';
import { HttpEffectError } from './effects/http';
import { IntegrationError } from './effects/integration-error';
import { AutomationRunCancelledError } from './effects/run-abort';
import { UnknownSceneError } from './effects/scene';

export function effectFailure(cause: unknown): NodeResult {
  if (cause instanceof AutomationRunCancelledError) throw cause;
  if (cause instanceof HttpEffectError || cause instanceof IntegrationError) {
    return { ok: false, class: cause.kind, message: cause.message };
  }
  if (cause instanceof ApiError && cause.code === 'command_refused') {
    return { ok: false, class: 'Refused', message: failureLine(cause) };
  }
  if (cause instanceof UnknownSceneError) {
    return { ok: false, class: 'NotFound', message: failureLine(cause) };
  }
  return { ok: false, class: 'Failed', message: failureLine(cause) };
}
