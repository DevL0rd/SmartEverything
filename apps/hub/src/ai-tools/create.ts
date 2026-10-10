import { join } from 'node:path';
import type { Logger } from '@smarteverything/logging';
import type { Clock } from '../clock';
import { COMMAND_WAIT_MS } from '../extensions/mcp/command-waiter';
import type { RunningHub } from '../hub';
import type { Operations } from '../server/operations';
import { recordingPathIn } from '../services';
import type { Store } from '../store/store';
import { SeTools } from './se-tools';
import { ToolHub } from './tool-hub';

export interface ToolHubOptions {
  readonly store: Store;
  readonly hub: RunningHub;
  readonly operations: Operations;
  readonly dataDirectory: string;
  readonly clock: Clock;
  readonly log: Logger;
}

function deviceLabel(store: Store, id: string): string | null {
  const device = store.devices.list().find((candidate) => candidate.id === id);
  if (device === undefined) {
    return null;
  }
  const room = store.rooms.list().find((candidate) => candidate.id === device.room_id)?.name;
  const name = device.name.toLowerCase();
  if (room === undefined || name.includes(room.toLowerCase())) {
    return name;
  }
  return `${room.toLowerCase()} ${name}`;
}

export function createToolHub(options: ToolHubOptions): ToolHub {
  const { store } = options;
  return new ToolHub([
    new SeTools({
      context: {
        store,
        hub: options.hub,
        clock: options.clock,
        operations: options.operations,
        commandWaitMs: COMMAND_WAIT_MS,
        recordingPath: recordingPathIn(options.dataDirectory),
        caller: null,
        actor: null,
        calls: null,
        assistantFiles: join(options.dataDirectory, 'assistant'),
      },
      deviceName: (id): string | null => deviceLabel(store, id),
      log: options.log,
    }),
  ]);
}
