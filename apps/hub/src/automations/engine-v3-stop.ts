import type { CancelReason } from '@smarteverything/flow/state/run-state';
import type { NodeResult, Outputs } from '@smarteverything/flow/interpret/frames';
import { z } from 'zod';

export const STOP_AUTOMATION_KIND = 'automation.stop';

const STOP_PARAMS = z.object({
  automation: z.string().min(1),
  key: z.string().min(1).nullable().optional(),
});

export type CancelAutomation = (automationId: string, reason: CancelReason, key?: string) => number;

export function stopAutomation(params: Outputs, cancel: CancelAutomation): NodeResult {
  const checked = STOP_PARAMS.safeParse(params);
  if (!checked.success) {
    return { ok: false, class: 'Invalid', message: z.prettifyError(checked.error) };
  }
  const { automation, key } = checked.data;
  cancel(automation, 'user_stop', key ?? undefined);
  return { ok: true, value: {} };
}
