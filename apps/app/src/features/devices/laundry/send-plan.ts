import { isFinished, type JsonValue } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import type { CommandLedger } from '../../../store/command-ledger';
import type { EntityStore } from '../../../store/entity-store';
import type { Device, StoreState } from '../../../store/state';

const log = new Logger('app.devices');

const COMMAND_COMPLETION_GRACE_MS = 5000;

export interface PlanStep {
  readonly capability: string;
  readonly value: JsonValue;
  readonly label: string;
}

export interface PlanRun {
  readonly device: Device;
  readonly ledger: Pick<CommandLedger, 'send'>;
  readonly store: EntityStore;
}

export type PlanResult =
  | { readonly sent: true }
  | { readonly sent: false; readonly failed: string; readonly sentBefore: number };

function commandDone(state: StoreState, id: string): boolean | undefined {
  const row = state.tables.commands.byId[id];
  return row !== undefined && isFinished(row.status) ? row.status === 'succeeded' : undefined;
}

function settled(store: EntityStore, id: string, expires: string): Promise<boolean> {
  return new Promise((resolve) => {
    const finish = (outcome: boolean): void => {
      unsubscribe();
      clearTimeout(timer);
      resolve(outcome);
    };
    const check = (): void => {
      const outcome = commandDone(store.get(), id);
      if (outcome !== undefined) {
        finish(outcome);
      }
    };
    const unsubscribe = store.subscribe(check);
    const timer = setTimeout(
      () => {
        log.warn('laundry.step_timed_out', { commandId: id });
        finish(false);
      },
      Math.max(0, Date.parse(expires) - Date.now()) + COMMAND_COMPLETION_GRACE_MS,
    );
    check();
  });
}

async function dispatch(run: PlanRun, step: PlanStep): Promise<boolean> {
  const where = { deviceId: run.device.id, capability: step.capability };
  const sent = await run.ledger.send(run.device, step.capability, step.value);
  if (!sent.sent) {
    log.warn('laundry.step_refused', { ...where, reason: sent.message });
    return false;
  }
  const done = await settled(run.store, sent.row.id, sent.row.expires_at);
  log[done ? 'debug' : 'warn'](done ? 'laundry.step_done' : 'laundry.step_failed', {
    ...where,
    commandId: sent.row.id,
  });
  return done;
}

export async function sendPlan(run: PlanRun, steps: readonly PlanStep[]): Promise<PlanResult> {
  log.info('laundry.plan_started', { deviceId: run.device.id, steps: steps.length });
  for (const [index, step] of steps.entries()) {
    if (!(await dispatch(run, step))) {
      return { sent: false, failed: step.label, sentBefore: index };
    }
  }
  return { sent: true };
}

export function failureText(result: Extract<PlanResult, { sent: false }>): string {
  return `The machine did not take “${result.failed}”. Nothing after it was sent.`;
}
