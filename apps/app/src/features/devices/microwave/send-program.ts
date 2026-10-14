import {
  isFinished,
  MICROWAVE_KEYS,
  type JsonValue,
  type MicrowaveMode,
  type MicrowaveProgram,
} from '@smarteverything/domain';
import type { CommandLedger } from '../../../store/command-ledger';
import type { EntityStore } from '../../../store/entity-store';
import type { Device } from '../../../store/state';

const COMMAND_COMPLETION_GRACE_MS = 5000;

interface ProgramChange {
  readonly capability: string;
  readonly value: JsonValue;
}
export function programChanges(
  program: MicrowaveProgram,
  mode: MicrowaveMode,
  unit: string,
): readonly ProgramChange[] {
  const options = mode.supportedOptions;
  return [
    ...(options.operationTime === undefined
      ? []
      : [{ capability: MICROWAVE_KEYS.setDuration, value: { operationTime: program.duration } }]),
    ...(options.powerLevel === undefined
      ? []
      : [{ capability: MICROWAVE_KEYS.power, value: program.power }]),
    ...(options.temperature?.[unit] === undefined
      ? []
      : [{ capability: MICROWAVE_KEYS.temperature, value: program.temperature }]),
  ];
}
async function completed(store: EntityStore, id: string, expires: string): Promise<boolean> {
  return new Promise((resolve) => {
    const finish = (success: boolean): void => {
      unsubscribe();
      clearTimeout(timer);
      resolve(success);
    };
    const check = (): void => {
      const row = store.get().tables.commands.byId[id];
      if (row !== undefined && isFinished(row.status)) {
        finish(row.status === 'succeeded');
      }
    };
    const unsubscribe = store.subscribe(check);
    const timer = setTimeout(
      () => {
        finish(false);
      },
      Math.max(0, Date.parse(expires) - Date.now()) + COMMAND_COMPLETION_GRACE_MS,
    );
    check();
  });
}
export async function sendProgram(
  device: Device,
  ledger: CommandLedger,
  store: EntityStore,
  changes: readonly ProgramChange[],
): Promise<boolean> {
  for (const change of changes) {
    const sent = await ledger.send(device, change.capability, change.value);
    if (!sent.sent || !(await completed(store, sent.row.id, sent.row.expires_at))) {
      return false;
    }
  }
  return true;
}
