import {
  DEFAULT_COMPUTER_SCOPES,
  DEVICE_COMMAND,
  type DeviceCommand,
  type ComputerScopes,
  type DeviceEvent,
  type NodeRequest,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  runComputerCommand,
  type CommandOrigin,
  type ComputerCommandContext,
} from '../../src/computers/computer-commands';
import { captureLogs } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

interface Recorded {
  readonly events: DeviceEvent[];
  readonly requests: NodeRequest[];
  readonly woken: string[];
}

function context(
  scopes: ComputerScopes,
  origin: CommandOrigin,
): { readonly recorded: Recorded; readonly context: ComputerCommandContext } {
  const recorded: Recorded = { events: [], requests: [], woken: [] };
  return {
    recorded,
    context: {
      directory: {
        byExternalId: () => ({
          call: (request): Promise<null> => {
            recorded.requests.push(request);
            return Promise.resolve(null);
          },
        }),
      },
      deviceIdOf: () => 'device-1',
      scopesOf: () => scopes,
      originOf: () => origin,
      macsOf: () => ['aa:bb:cc:dd:ee:01', 'aa:bb:cc:dd:ee:02'],
      wake: (mac): Promise<void> => {
        recorded.woken.push(mac);
        return Promise.resolve();
      },
      sink: {
        state: () => undefined,
        event: (event) => recorded.events.push(event),
        devices: () => undefined,
        failure: () => undefined,
        online: () => undefined,
      },
      now: () => new Date('2026-10-10T10:00:00.000Z'),
    },
  };
}

function command(capability: string): DeviceCommand {
  return DEVICE_COMMAND.parse({
    commandId: '00000000-0000-4000-8000-000000000001',
    externalId: 'computer:abc',
    capability,
    value: null,
  });
}

const FROM_APP: CommandOrigin = { source: 'app', client: 'Phone' };
const FROM_AI: CommandOrigin = { source: 'assistant', client: 'Claude' };

describe('computer commands (fake node, nothing is ever powered off)', () => {
  it('records who asked and passes the power action to the node', async () => {
    const { recorded, context: ctx } = context(DEFAULT_COMPUTER_SCOPES, FROM_APP);
    await runComputerCommand(command('restart'), ctx);
    expect(recorded.requests).toEqual([{ verb: 'power', action: 'restart' }]);
    expect(recorded.events).toEqual([
      {
        externalId: 'computer:abc',
        kind: 'computer_power',
        occurredAt: '2026-10-10T10:00:00.000Z',
        details: { action: 'restart', source: 'app', client: 'Phone' },
      },
    ]);
  });

  it('refuses the AI unless the computer allows AI power actions', async () => {
    const refused = context({ ...DEFAULT_COMPUTER_SCOPES, ai_power: false }, FROM_AI);
    await expect(runComputerCommand(command('shut_down'), refused.context)).rejects.toThrow(
      'The AI may not use power actions on this computer.',
    );
    expect(refused.recorded.requests).toEqual([]);
    expect(refused.recorded.events).toEqual([]);
    const allowed = context({ ...DEFAULT_COMPUTER_SCOPES, ai_power: true }, FROM_AI);
    await runComputerCommand(command('shut_down'), allowed.context);
    expect(allowed.recorded.requests).toEqual([{ verb: 'power', action: 'shut_down' }]);
  });

  it('refuses everyone when power actions are off', async () => {
    const { context: ctx } = context({ ...DEFAULT_COMPUTER_SCOPES, power: false }, FROM_APP);
    await expect(runComputerCommand(command('sleep'), ctx)).rejects.toThrow(
      'Power actions are turned off for this computer.',
    );
  });

  it('wakes every network card of the computer from the hub', async () => {
    const { recorded, context: ctx } = context(DEFAULT_COMPUTER_SCOPES, FROM_APP);
    await runComputerCommand(command('wake'), ctx);
    expect(recorded.woken).toEqual(['aa:bb:cc:dd:ee:01', 'aa:bb:cc:dd:ee:02']);
    expect(recorded.requests).toEqual([]);
  });

  it('says plainly what computers cannot do', async () => {
    const { context: ctx } = context(DEFAULT_COMPUTER_SCOPES, FROM_APP);
    await expect(runComputerCommand(command('brightness'), ctx)).rejects.toThrow(
      'Computers cannot do “brightness”.',
    );
  });
});

describe('computer permissions', () => {
  let opened: TestStore;

  beforeEach(async () => {
    captureLogs();
    opened = await testStore();
  });

  afterEach(async () => {
    await opened.close();
  });

  it('starts with every permission on and keeps changes', () => {
    const [device] = opened.store.devices.upsert([
      {
        provider: 'local',
        externalId: 'computer:abc',
        parentId: null,
        kind: 'computer',
        name: 'Desk',
        model: 'smarteverything.computer',
        manufacturer: 'Linux',
        providerRoom: null,
        roomId: null,
        online: true,
        capabilities: [],
        details: {},
      },
    ]);
    const id = device?.id ?? '';
    expect(opened.store.computerScopes.read(id)).toEqual(DEFAULT_COMPUTER_SCOPES);
    opened.store.computerScopes.update(id, { screenshots: false });
    expect(opened.store.computerScopes.read(id)).toEqual({
      ...DEFAULT_COMPUTER_SCOPES,
      screenshots: false,
    });
  });
});
