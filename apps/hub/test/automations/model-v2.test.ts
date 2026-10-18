import {
  API_ENDPOINTS,
  AUTOMATION_CHOICE_ID,
  type AutomationV2,
  type SetControl,
  type ToV2,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { createAutomation, setPower } from './support/programs';
import { runsOf, startAndFinish } from './support/runs';
import { useRig } from './support/use-rig';
import { createValue } from './support/values';

const rig = useRig();

const MANUAL: AutomationV2['when'] = [];

function setStep(device: string, control: SetControl, to: ToV2): AutomationV2['steps'][number] {
  return { do: 'set', target: { device }, control, to };
}

async function save(
  name: string,
  definition: Omit<AutomationV2, 'when'> & { readonly when?: AutomationV2['when'] },
): Promise<Awaited<ReturnType<typeof createAutomation>>> {
  const row = await rig().request(API_ENDPOINTS.createAutomation, {
    body: { name, definition: { when: MANUAL, ...definition } },
  });
  await rig().settle();
  return row;
}

describe('B11-18 the draft is tested on the hub', () => {
  it('runs an unsaved draft as a real run and saves nothing', async () => {
    const run = await rig().request(API_ENDPOINTS.testAutomation, {
      body: {
        definition: { when: [], steps: [setStep(rig().ids.lamp, 'power', true)] },
        wait: true,
      },
    });
    expect(run.status).toBe('succeeded');
    expect(run.trace).toHaveLength(1);
    expect(rig().sent()).toStrictEqual([['lamp-1', 'power', true]]);
    expect(await rig().request(API_ENDPOINTS.listAutomations)).toStrictEqual([]);
  });

  it('files every run of an unsaved draft under one shared id so the history stays bounded', async () => {
    const body = {
      definition: { when: [], steps: [setStep(rig().ids.lamp, 'power', true)] },
      wait: true,
    };
    const first = await rig().request(API_ENDPOINTS.testAutomation, { body });
    const second = await rig().request(API_ENDPOINTS.testAutomation, { body });
    expect(second.automation_id).toBe(first.automation_id);
  });

  it('files the run of a draft under the automation being edited', async () => {
    const row = await save('Edited', { steps: [setStep(rig().ids.lamp, 'power', false)] });
    const run = await rig().request(API_ENDPOINTS.testAutomation, {
      body: {
        automationId: row.id,
        definition: { when: [], steps: [setStep(rig().ids.lampTwo, 'power', true)] },
        wait: true,
      },
    });
    expect(run).toMatchObject({ automation_id: row.id, status: 'succeeded' });
    expect(rig().sent()).toStrictEqual([['lamp-2', 'power', true]]);
    expect((await runsOf(rig(), row.id)).map((entry) => entry.id)).toStrictEqual([run.id]);
  });

  it('refuses a draft with a step the member may not run', async () => {
    const member = await rig().member();
    const refusal = await member.refused(API_ENDPOINTS.testAutomation, {
      body: {
        definition: {
          when: [],
          steps: [{ do: 'ai', person: rig().profileId, instruction: 'Look around' }],
        },
      },
    });
    expect(refusal.status).toBe(403);
  });
});

describe('B11-7 a choice Value drives an enum control by its label', () => {
  it('sends the label of the selected choice', async () => {
    const quiet = AUTOMATION_CHOICE_ID.parse('4c000000-0000-4000-8000-000000000001');
    const loud = AUTOMATION_CHOICE_ID.parse('4c000000-0000-4000-8000-000000000002');
    const mode = await createValue(rig(), {
      kind: 'choice',
      name: 'House mode',
      value: loud,
      choices: [
        { id: quiet, label: 'sleep' },
        { id: loud, label: 'boost' },
      ],
      overflow: 'clamp',
    });
    const row = await save('Mode', {
      steps: [setStep(rig().ids.fan, 'fan_mode', { from: { value: mode.id } })],
    });
    await startAndFinish(rig(), row.id);
    expect(rig().sent()).toStrictEqual([['fan-1', 'fan_mode', 'boost']]);
  });
});

describe('B11-25 a target can be prepared before its devices exist', () => {
  it('saves a command for an empty room and reports at run time that it had no devices', async () => {
    const room = await rig().request(API_ENDPOINTS.createRoom, { body: { name: 'Attic' } });
    const row = await rig().request(API_ENDPOINTS.createAutomation, {
      body: {
        name: 'Attic light',
        definition: {
          when: [],
          steps: [{ do: 'set', target: { room: room.id }, control: 'power', to: true }],
        },
      },
    });
    const run = await startAndFinish(rig(), row.id);
    expect(run.status).toBe('failed');
    expect(run.error).toContain('no devices');
  });
});

describe('B11-27 a repeat needs no limit or gap', () => {
  it('repeats a set number of times without naming either', async () => {
    const row = await save('Blink', {
      steps: [
        {
          do: 'repeat',
          times: 3,
          steps: [setStep(rig().ids.lamp, 'power', true)],
        },
      ],
    });
    const run = await startAndFinish(rig(), row.id);
    expect(run.status).toBe('succeeded');
    expect(rig().commands()).toHaveLength(3);
    expect(run.trace.at(-1)?.error).toBeNull();
  });
});

describe('C22 reusable steps keep their typed inputs', () => {
  it('refuses a run whose inputs do not fit what the automation declares', async () => {
    const row = await rig().request(API_ENDPOINTS.createAutomation, {
      body: {
        name: 'Dim to',
        definition: {
          when: [],
          inputs: [{ name: 'level', type: 'number' }],
          steps: [setStep(rig().ids.lamp, 'brightness', { from: { input: 'level' } })],
        },
      },
    });
    const refusals = await Promise.all(
      [{}, { level: 'high' }, { level: 4, extra: 1 }].map((inputs) =>
        rig().refused(API_ENDPOINTS.runAutomation, {
          params: { automationId: row.id },
          body: { inputs },
        }),
      ),
    );
    expect(refusals.map((refusal) => refusal.status)).toStrictEqual([400, 400, 400]);
    const run = await rig().request(API_ENDPOINTS.runAutomation, {
      params: { automationId: row.id },
      body: { inputs: { level: 45 }, wait: true },
    });
    expect(run.status).toBe('succeeded');
    expect(rig().sent()).toStrictEqual([['lamp-1', 'brightness', 45]]);
  });

  it('keeps inputs for automations that have no triggers', async () => {
    const refusal = await rig().refused(API_ENDPOINTS.createAutomation, {
      body: {
        name: 'Both',
        definition: {
          when: [{ on: 'every', minutes: 5 }],
          inputs: [{ name: 'level', type: 'number' }],
          steps: [{ do: 'wait', ms: 1000 }],
        },
      },
    });
    expect(refusal.status).toBe(400);
  });
});

describe('C24 an automation runs one at a time unless it says otherwise', () => {
  it('ignores a second start while the first still runs when no mode is named', async () => {
    const row = await save('Slow', {
      steps: [{ do: 'wait', ms: 600_000 }, setStep(rig().ids.lamp, 'power', true)],
    });
    const first = await rig().request(API_ENDPOINTS.runAutomation, {
      params: { automationId: row.id },
    });
    await rig().until(async () => (await runsOf(rig(), row.id)).length === 1);
    const second = await rig().request(API_ENDPOINTS.runAutomation, {
      params: { automationId: row.id },
    });
    expect(second.status).toBe('ignored');
    expect(first.id).not.toBe(second.id);
  });
});

describe('B11-6 one run is recorded once', () => {
  it('shows a triggered run once in the history', async () => {
    const row = await createAutomation(rig(), 'Doorbell', {
      triggers: [{ type: 'event', deviceId: null, kind: 'doorbell' }],
      actions: [setPower(rig().ids.lamp, true)],
    });
    await rig().event('lamp-1', 'doorbell');
    await rig().until(async () => (await runsOf(rig(), row.id)).length === 1);
    await rig().settle();
    expect(await runsOf(rig(), row.id)).toHaveLength(1);
    const events = await rig().request(API_ENDPOINTS.listEvents, { query: { limit: '50' } });
    expect(
      events.filter(
        (event) => event.kind === 'automation_run' && event.details['automationId'] === row.id,
      ),
    ).toHaveLength(1);
  });
});

describe('a device state trigger does not repeat after the engine reloads', () => {
  it('fires on entering the state and not again for a value that keeps satisfying it', async () => {
    const row = await createAutomation(rig(), 'Warm', {
      triggers: [
        {
          type: 'state',
          deviceId: rig().ids.sensor,
          capability: 'temperature',
          comparison: { operator: 'gt', value: 20 },
        },
      ],
      actions: [setPower(rig().ids.lamp, true)],
    });
    await rig().state('sensor-1', 'temperature', 25);
    await rig().until(() => rig().commands().length === 1);
    await rig().request(API_ENDPOINTS.updateAutomation, {
      params: { automationId: row.id },
      body: { name: 'Warm room' },
    });
    await rig().settle();
    await rig().state('sensor-1', 'temperature', 30);
    await rig().settle();
    expect(rig().commands()).toHaveLength(1);
    await rig().state('sensor-1', 'temperature', 10);
    await rig().state('sensor-1', 'temperature', 22);
    await rig().until(() => rig().commands().length === 2);
  });
});
