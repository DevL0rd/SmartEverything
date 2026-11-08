import {
  ApiError,
  isFinished,
  type CommandRow,
  type DeviceRow,
  type JsonValue,
} from '@smarteverything/domain';
import type {
  DriverRuntime,
  DriverTool,
  DriverToolReply,
} from '../../automations/plugin-kinds/driver-nodes';
import type { Store } from '../../store/store';
import type { NewCommand } from '../../store/repositories/commands';
import { START_TOOL, startTreadmill, type BeltControl, type TreadmillControls } from './automation';

export const TREADMILL_ERROR_CODES = { notFound: 'treadmill_not_found' } as const;

export interface TreadmillToolPorts {
  readonly find: (deviceId: string) => DeviceRow | null;
  readonly issue: (device: DeviceRow, control: BeltControl, value: JsonValue) => Promise<JsonValue>;
}

function refusal(message: string, code: string): DriverToolReply {
  return { error: message, code };
}

function startTool(ports: TreadmillToolPorts): DriverTool {
  return {
    name: START_TOOL.name,
    description: 'Starts the treadmill belt, optionally with a goal and a speed.',
    input: START_TOOL.input,
    run: async (args): Promise<DriverToolReply> => {
      const input = START_TOOL.input.parse(args);
      const device = ports.find(input.device);
      if (device === null) {
        return refusal('This treadmill is no longer added.', TREADMILL_ERROR_CODES.notFound);
      }
      const controls: TreadmillControls = {
        set: (control, value) => ports.issue(device, control, value),
      };
      try {
        return await startTreadmill(controls, input);
      } catch (cause) {
        if (cause instanceof ApiError) return refusal(cause.message, cause.code);
        throw cause;
      }
    },
  };
}

export function treadmillAutomationRuntime(ports: TreadmillToolPorts): DriverRuntime {
  return { tools: [startTool(ports)], options: {} };
}

export interface HubCommandPorts {
  readonly store: Pick<Store, 'commands' | 'feed'>;
  readonly submit: (commands: readonly NewCommand[]) => CommandRow[];
}

function finishedRow(store: HubCommandPorts['store'], row: CommandRow): Promise<CommandRow> {
  return new Promise((resolve) => {
    const unsubscribe = store.feed.subscribe((change) => {
      if (
        change.table === 'commands' &&
        change.record?.id === row.id &&
        isFinished(change.record.status)
      ) {
        unsubscribe();
        resolve(change.record);
      }
    });
    const current = store.commands.byId(row.id);
    if (isFinished(current.status)) {
      unsubscribe();
      resolve(current);
    }
  });
}

export function issueThroughHub(ports: HubCommandPorts): TreadmillToolPorts['issue'] {
  return async (device, control, value) => {
    const [row] = ports.submit([
      { deviceId: device.id, capability: control, value, source: 'automation', requestedBy: null },
    ]);
    if (row === undefined) {
      throw new ApiError(
        'upstream_failed',
        'Submitting the treadmill command returned no command.',
      );
    }
    const done = await finishedRow(ports.store, row);
    if (done.status !== 'succeeded') {
      throw new ApiError(
        'upstream_failed',
        done.error ?? 'The treadmill command expired before the treadmill answered.',
      );
    }
    return done.result;
  };
}
