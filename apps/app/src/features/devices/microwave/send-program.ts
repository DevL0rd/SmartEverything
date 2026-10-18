import {
  isFinished,
  MICROWAVE_KEYS,
  type JsonValue,
  type MicrowaveMode,
  type MicrowaveProgram,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import type { CommandLedger } from '../../../store/command-ledger';
import type { EntityStore } from '../../../store/entity-store';
import type { Device, StoreState } from '../../../store/state';
import { confirmedValue } from './program-status';

const log = new Logger('app.devices');

const COMMAND_COMPLETION_GRACE_MS = 5000;

interface ProgramStep {
  readonly capability: string;
  readonly value: JsonValue;
  readonly reported: { readonly key: string; readonly value: JsonValue };
}
export interface ProgramPlan {
  readonly mode: ProgramStep | null;
  readonly settings: readonly ProgramStep[];
  readonly start: boolean;
}
export interface ProgramRun {
  readonly device: Device;
  readonly ledger: Pick<CommandLedger, 'send'>;
  readonly store: EntityStore;
}
export interface PlanInput {
  readonly program: MicrowaveProgram;
  readonly mode: MicrowaveMode;
  readonly unit: string;
  readonly applied: string | undefined;
  readonly start: boolean;
}
type Probe = (state: StoreState) => boolean | undefined;

function settingSteps(
  program: MicrowaveProgram,
  mode: MicrowaveMode,
  unit: string,
): readonly ProgramStep[] {
  const options = mode.supportedOptions;
  return [
    ...(options.operationTime === undefined
      ? []
      : [
          {
            capability: MICROWAVE_KEYS.setDuration,
            value: { operationTime: program.duration },
            reported: { key: MICROWAVE_KEYS.duration, value: program.duration },
          },
        ]),
    ...(options.powerLevel === undefined
      ? []
      : [
          {
            capability: MICROWAVE_KEYS.power,
            value: program.power,
            reported: { key: MICROWAVE_KEYS.power, value: program.power },
          },
        ]),
    ...(options.temperature?.[unit] === undefined
      ? []
      : [
          {
            capability: MICROWAVE_KEYS.temperature,
            value: program.temperature,
            reported: { key: MICROWAVE_KEYS.temperature, value: program.temperature },
          },
        ]),
  ];
}
export function programPlan({ program, mode, unit, applied, start }: PlanInput): ProgramPlan {
  return {
    mode:
      program.mode === applied
        ? null
        : {
            capability: MICROWAVE_KEYS.mode,
            value: program.mode,
            reported: { key: MICROWAVE_KEYS.mode, value: program.mode },
          },
    settings: mode.supportedOperations.includes('set') ? settingSteps(program, mode, unit) : [],
    start,
  };
}
function settle(store: EntityStore, probe: Probe, expires: string): Promise<boolean> {
  return new Promise((resolve) => {
    const finish = (outcome: boolean): void => {
      unsubscribe();
      clearTimeout(timer);
      resolve(outcome);
    };
    const check = (): void => {
      const outcome = probe(store.get());
      if (outcome !== undefined) {
        finish(outcome);
      }
    };
    const unsubscribe = store.subscribe(check);
    const timer = setTimeout(
      () => {
        log.warn('microwave.settle_timed_out', { expires });
        finish(false);
      },
      Math.max(0, Date.parse(expires) - Date.now()) + COMMAND_COMPLETION_GRACE_MS,
    );
    check();
  });
}
function commandDone(id: string): Probe {
  return (state) => {
    const row = state.tables.commands.byId[id];
    return row !== undefined && isFinished(row.status) ? row.status === 'succeeded' : undefined;
  };
}
function reportedSteps(deviceId: string, steps: readonly ProgramStep[]): Probe {
  return (state) =>
    steps.every(({ reported }) =>
      confirmedValue(state.deviceValues.get(deviceId) ?? {}, reported.key, reported.value),
    )
      ? true
      : undefined;
}
async function dispatch(
  run: ProgramRun,
  capability: string,
  value: JsonValue,
): Promise<string | null> {
  const where = { deviceId: run.device.id, capability };
  const startedAt = Date.now();
  const sent = await run.ledger.send(run.device, capability, value);
  if (!sent.sent) {
    log.warn('microwave.step_refused', { ...where, reason: sent.message });
    return null;
  }
  const done = await settle(run.store, commandDone(sent.row.id), sent.row.expires_at);
  const fields = { ...where, commandId: sent.row.id, latencyMs: Date.now() - startedAt };
  if (!done) {
    log.warn('microwave.step_failed', fields);
    return null;
  }
  log.debug('microwave.step_done', fields);
  return sent.row.expires_at;
}
async function applyConfirmed(run: ProgramRun, steps: readonly ProgramStep[]): Promise<boolean> {
  let expires = '';
  for (const step of steps) {
    const done = await dispatch(run, step.capability, step.value);
    if (done === null) {
      return false;
    }
    expires = done;
  }
  if (steps.length === 0) {
    return true;
  }
  const reported = await settle(run.store, reportedSteps(run.device.id, steps), expires);
  if (!reported) {
    log.warn('microwave.report_missing', {
      deviceId: run.device.id,
      steps: steps.map((step) => step.capability).join(','),
    });
  }
  return reported;
}
export async function runProgram(run: ProgramRun, plan: ProgramPlan): Promise<boolean> {
  log.info('microwave.program_started', {
    deviceId: run.device.id,
    modeChange: plan.mode !== null,
    settings: plan.settings.length,
    start: plan.start,
  });
  if (plan.mode !== null && !(await applyConfirmed(run, [plan.mode]))) {
    return false;
  }
  if (!(await applyConfirmed(run, plan.settings))) {
    return false;
  }
  return !plan.start || (await dispatch(run, MICROWAVE_KEYS.start, null)) !== null;
}
