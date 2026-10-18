import {
  CommandRefusedError,
  DEFAULT_COMPUTER_SCOPES,
  DEVICE_COMMAND,
  type ComputerScopes,
  type DeviceCommand,
  type DeviceEvent,
  type JsonValue,
  type MachineAction,
  type MachineActionSupport,
  type NodeRequest,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  runComputerCommand,
  type CommandOrigin,
  type ComputerCommandContext,
} from '../../src/computers/computer-commands';
import { MachineApprovalDeniedError } from '../../src/machines/approval';

interface Rig {
  readonly context: ComputerCommandContext;
  readonly requests: NodeRequest[];
  readonly events: DeviceEvent[];
  readonly approvals: string[];
}

const FROM_APP: CommandOrigin = { source: 'app', client: 'Phone', clientId: 'phone-1' };
const FROM_AI: CommandOrigin = { source: 'assistant', client: 'Claude', clientId: null };
const READY = (action: MachineAction): MachineActionSupport => ({ action, state: 'ready' });

function rig(options: {
  readonly origin: CommandOrigin;
  readonly supports: readonly MachineActionSupport[];
  readonly scopes?: ComputerScopes;
  readonly approve?: () => Promise<void>;
}): Rig {
  const requests: NodeRequest[] = [];
  const events: DeviceEvent[] = [];
  const approvals: string[] = [];
  return {
    requests,
    events,
    approvals,
    context: {
      directory: {
        byExternalId: () => ({
          role: 'pc',
          machineActions: () => options.supports,
          call: (request): Promise<null> => {
            requests.push(request);
            return Promise.resolve(null);
          },
        }),
      },
      deviceIdOf: () => 'device-1',
      scopesOf: () => options.scopes ?? { ...DEFAULT_COMPUTER_SCOPES, ai_power: true },
      originOf: () => options.origin,
      visibleTo: () => true,
      macsOf: () => [],
      wake: () => Promise.resolve(),
      approve: (_deviceId, action, source): Promise<void> => {
        approvals.push(`${action} by ${source}`);
        return options.approve?.() ?? Promise.resolve();
      },
      sink: {
        state: () => undefined,
        event: (event) => events.push(event),
        devices: () => undefined,
        failure: () => undefined,
        online: () => undefined,
      },
      now: () => new Date('2026-10-18T10:00:00.000Z'),
    },
  };
}

function command(capability: string, value: JsonValue = null): DeviceCommand {
  return DEVICE_COMMAND.parse({
    commandId: '00000000-0000-4000-8000-000000000002',
    externalId: 'computer:abc',
    capability,
    value,
  });
}

describe('machine actions on a computer (fake node, nothing is ever unlocked)', () => {
  it('sends ring and stop ring to the node and records who asked', async () => {
    const { context, requests, events } = rig({
      origin: FROM_APP,
      supports: [READY('ring'), READY('stop_ring')],
    });
    await runComputerCommand(command('ring'), context);
    await runComputerCommand(command('stop_ring'), context);
    expect(requests).toEqual([
      { verb: 'ring', on: true },
      { verb: 'ring', on: false },
    ]);
    expect(events.map((event) => event.details)).toEqual([
      { action: 'ring', source: 'app', client: 'Phone' },
      { action: 'stop_ring', source: 'app', client: 'Phone' },
    ]);
  });

  it('opens a link or a file path and starts an app by its id', async () => {
    const { context, requests } = rig({
      origin: FROM_AI,
      supports: [READY('open'), READY('launch_app')],
    });
    await runComputerCommand(command('open', 'https://example.com/a'), context);
    await runComputerCommand(command('open', 'C:\\Users\\me\\a.pdf'), context);
    await runComputerCommand(command('launch_app', 'org.kde.dolphin'), context);
    expect(requests).toEqual([
      { verb: 'open', target: { kind: 'url', url: 'https://example.com/a' } },
      { verb: 'open', target: { kind: 'path', path: 'C:\\Users\\me\\a.pdf' } },
      { verb: 'open_app', appId: 'org.kde.dolphin' },
    ]);
  });

  it('refuses something to open that is neither a link nor an absolute path', async () => {
    const { context, requests } = rig({ origin: FROM_AI, supports: [READY('open')] });
    await expect(runComputerCommand(command('open', 'relative/file'), context)).rejects.toThrow(
      CommandRefusedError,
    );
    expect(requests).toEqual([]);
  });

  it('names the missing permission instead of sending when the machine needs one', async () => {
    const { context, requests } = rig({
      origin: FROM_AI,
      supports: [
        {
          action: 'ring',
          state: 'needs_permission',
          permission: 'mac_automation',
          reason: 'macOS has not allowed volume control yet.',
        },
      ],
    });
    await expect(runComputerCommand(command('ring'), context)).rejects.toThrow(
      'Grant "Automation" on that machine.',
    );
    expect(requests).toEqual([]);
  });

  it('refuses an action the machine does not report at all', async () => {
    const { context } = rig({ origin: FROM_APP, supports: [] });
    await expect(runComputerCommand(command('launch_app', 'x'), context)).rejects.toThrow(
      'has not reported that it can launch app',
    );
  });

  it('respects the apps scope for ring and open', async () => {
    const { context, requests } = rig({
      origin: FROM_APP,
      supports: [READY('ring')],
      scopes: { ...DEFAULT_COMPUTER_SCOPES, apps: false },
    });
    await expect(runComputerCommand(command('ring'), context)).rejects.toThrow();
    expect(requests).toEqual([]);
  });
});

describe('unlock needs approval unless a person asks in the app', () => {
  const supports = [READY('unlock'), READY('show_unlock')];

  it('sends nothing until the owner approves an AI request, then unlocks', async () => {
    const { context, requests, approvals } = rig({ origin: FROM_AI, supports });
    await runComputerCommand(command('unlock'), context);
    expect(approvals).toEqual(['unlock by assistant']);
    expect(requests).toEqual([{ verb: 'unlock' }]);
  });

  it('never reaches the node when the approval is denied', async () => {
    const { context, requests, events } = rig({
      origin: FROM_AI,
      supports,
      approve: () =>
        Promise.reject(new MachineApprovalDeniedError('unlock', 'Denied on the phone.')),
    });
    await expect(runComputerCommand(command('unlock'), context)).rejects.toThrow(
      'Denied on the phone.',
    );
    expect(requests).toEqual([]);
    expect(events).toEqual([]);
  });

  it('lets the app unlock without a second approval because the app already confirmed', async () => {
    const { context, requests, approvals } = rig({ origin: FROM_APP, supports });
    await runComputerCommand(command('unlock'), context);
    expect(approvals).toEqual([]);
    expect(requests).toEqual([{ verb: 'unlock' }]);
  });

  it('refuses the AI before asking anyone when the computer keeps AI power actions off', async () => {
    const { context, approvals } = rig({
      origin: FROM_AI,
      supports,
      scopes: { ...DEFAULT_COMPUTER_SCOPES, ai_power: false },
    });
    await expect(runComputerCommand(command('unlock'), context)).rejects.toThrow(
      'The AI may not use power actions on this computer.',
    );
    expect(approvals).toEqual([]);
  });

  it('asks nobody to approve showing the unlock prompt', async () => {
    const { context, requests, approvals } = rig({ origin: FROM_AI, supports });
    await runComputerCommand(command('show_unlock'), context);
    expect(approvals).toEqual([]);
    expect(requests).toEqual([{ verb: 'show_unlock' }]);
  });
});
