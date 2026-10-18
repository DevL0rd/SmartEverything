import { API_ENDPOINTS, type JsonValue } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  createAutomation,
  nodeId,
  setBrightness,
  setPower,
  type Step,
  type Steps,
} from './support/programs';
import { startAndFinish } from './support/runs';
import { useRig } from './support/use-rig';
import { legacyAutomation } from '../support/legacy-automation';

const rig = useRig();

async function runSteps(actions: Steps): Promise<Awaited<ReturnType<typeof startAndFinish>>> {
  const row = await createAutomation(rig(), 'Steps', { actions });
  return startAndFinish(rig(), row.id);
}

function sorted(): (readonly [string, string, unknown])[] {
  return [...rig().sent()].sort((a, b) => a[0].localeCompare(b[0]));
}

describe('C11 set one device control to a literal', () => {
  it('sends the literal to the device as an automation command and records the run', async () => {
    const run = await runSteps([setBrightness(rig().ids.lamp, 35)]);
    expect(run.status).toBe('succeeded');
    expect(rig().sent()).toStrictEqual([['lamp-1', 'brightness', 35]]);
    const commands = await rig().request(API_ENDPOINTS.listCommands, {
      query: { limit: '5' },
    });
    expect(commands[0]).toMatchObject({
      capability: 'brightness',
      value: 35,
      source: 'automation',
    });
  });

  it('runs several commands in order', async () => {
    await runSteps([
      setPower(rig().ids.lamp, true),
      setBrightness(rig().ids.lamp, 10),
      setPower(rig().ids.lampTwo, false),
    ]);
    expect(rig().sent()).toStrictEqual([
      ['lamp-1', 'power', true],
      ['lamp-1', 'brightness', 10],
      ['lamp-2', 'power', false],
    ]);
  });

  it('refuses to save a command the device would refuse and saves nothing', async () => {
    const refusal = await rig().refused(API_ENDPOINTS.createAutomation, {
      body: {
        name: 'Too bright',
        definition: legacyAutomation({
          triggers: [{ type: 'interval', everyMinutes: 60 }],
          conditions: { mode: 'all', items: [] },
          actions: [setBrightness(rig().ids.lamp, 500)],
        }),
      },
    });
    expect(refusal.status).toBe(400);
    expect(refusal.message).toContain('Nothing was saved');
    expect(await rig().request(API_ENDPOINTS.listAutomations)).toHaveLength(0);
  });

  it('marks the run failed with the device error when the device rejects the command', async () => {
    rig().fake.adapter.failure = new Error('lamp unreachable');
    try {
      const run = await runSteps([setPower(rig().ids.lamp, true)]);
      expect(run.status).toBe('failed');
      expect(run.error).toContain('lamp unreachable');
    } finally {
      rig().fake.adapter.failure = null;
    }
  });
});

const study = (): string => rig().roomIds['Study'] ?? '';
const hall = (): string => rig().roomIds['Hall'] ?? '';

function targeted(
  target: Extract<Step, { type: 'target_command' }>['target'],
  capability: string,
  value: JsonValue,
  scale?: 'percent',
): Step {
  return {
    type: 'target_command',
    nodeId: nodeId(),
    target,
    capability,
    value,
    ...(scale === undefined ? {} : { scale }),
  };
}

describe('C12 set a room, group or list of devices', () => {
  it('commands every supporting device in a room', async () => {
    await runSteps([targeted({ kind: 'room', roomId: study() }, 'power', true)]);
    expect(sorted()).toStrictEqual([
      ['lamp-1', 'power', true],
      ['lamp-2', 'power', true],
      ['purifier-1', 'power', true],
    ]);
  });

  it('limits a room to the named device families', async () => {
    await runSteps([
      targeted({ kind: 'room', roomId: study(), families: ['light'] }, 'power', false),
    ]);
    expect(sorted()).toStrictEqual([
      ['lamp-1', 'power', false],
      ['lamp-2', 'power', false],
    ]);
  });

  it('commands the members of a named group', async () => {
    const group = await rig().request(API_ENDPOINTS.createDeviceGroup, {
      body: { name: 'Mixed', device_ids: [rig().ids.lamp, rig().ids.fan] },
    });
    await runSteps([targeted({ kind: 'group', groupId: group.id }, 'power', true)]);
    expect(sorted()).toStrictEqual([
      ['fan-1', 'power', true],
      ['lamp-1', 'power', true],
    ]);
  });

  it('commands an explicit list of devices', async () => {
    await runSteps([
      targeted({ kind: 'devices', deviceIds: [rig().ids.lampTwo, rig().ids.fan] }, 'power', true),
    ]);
    expect(sorted()).toStrictEqual([
      ['fan-1', 'power', true],
      ['lamp-2', 'power', true],
    ]);
  });

  it('finds the control by its presented role when the key differs', async () => {
    await runSteps([
      targeted({ kind: 'devices', deviceIds: [rig().ids.purifier] }, 'favourite_level', 9),
    ]);
    expect(rig().sent()).toStrictEqual([['purifier-1', 'fan_speed', 9]]);
  });

  it('scales a percentage to the range of each control', async () => {
    await runSteps([
      targeted(
        { kind: 'devices', deviceIds: [rig().ids.purifier] },
        'favourite_level',
        50,
        'percent',
      ),
      targeted({ kind: 'devices', deviceIds: [rig().ids.lamp] }, 'brightness', 50, 'percent'),
    ]);
    expect(rig().sent()).toStrictEqual([
      ['purifier-1', 'fan_speed', 7],
      ['lamp-1', 'brightness', 50],
    ]);
  });

  it('skips members without the control, still runs the rest and notes who was skipped', async () => {
    const run = await runSteps([targeted({ kind: 'room', roomId: hall() }, 'power', true)]);
    expect(run.status).toBe('succeeded');
    expect(rig().sent()).toStrictEqual([['fan-1', 'power', true]]);
    const note = run.trace.map((step) => step.error ?? '').join(' ');
    expect(note).toContain('Skipped members');
    expect(note).toContain('Hall sensor: Not supported');
    expect(note).not.toContain(rig().ids.sensor);
  });

  it('says why a room command is refused when the value is out of range', async () => {
    const refusal = await rig().refused(API_ENDPOINTS.createAutomation, {
      body: {
        name: 'Dim to zero',
        definition: legacyAutomation({
          triggers: [{ type: 'interval', everyMinutes: 60 }],
          conditions: { mode: 'all', items: [] },
          actions: [
            targeted({ kind: 'room', roomId: study(), families: ['light'] }, 'brightness', 500),
          ],
        }),
      },
    });
    expect(refusal.status).toBe(400);
    expect(refusal.message).toContain('outside');
  });

  it('refuses to save a target command that no member of the target supports', async () => {
    const refusal = await rig().refused(API_ENDPOINTS.createAutomation, {
      body: {
        name: 'Nothing to dim',
        definition: legacyAutomation({
          triggers: [{ type: 'interval', everyMinutes: 60 }],
          conditions: { mode: 'all', items: [] },
          actions: [targeted({ kind: 'room', roomId: hall() }, 'brightness', 20)],
        }),
      },
    });
    expect(refusal.status).toBe(400);
    expect(refusal.message).toContain('No target device supports');
  });
});
