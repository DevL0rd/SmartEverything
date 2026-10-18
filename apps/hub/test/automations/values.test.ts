import { API_ENDPOINTS, AUTOMATION_CHOICE_ID } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { createAutomation, nodeId, setPower } from './support/programs';
import { finishedRuns, startAndFinish } from './support/runs';
import { useRig } from './support/use-rig';
import { createValue, numberValue } from './support/values';

const rig = useRig();

const CHOICE_A = '3b000000-0000-4000-8000-000000000001';
const CHOICE_B = '3b000000-0000-4000-8000-000000000002';
const CHOICE_C = '3b000000-0000-4000-8000-000000000003';

describe('C23 Values', () => {
  it('starts at revision one and counts a revision for every change', async () => {
    const value = await numberValue(rig(), 'Level', 5);
    expect(value.revision).toBe(1);
    const changed = await rig().request(API_ENDPOINTS.applyAutomationValueOperation, {
      params: { valueId: value.id },
      body: { kind: 'number', operation: { type: 'add', value: 2 } },
    });
    expect(changed).toMatchObject({ revision: 2, content: { value: 7 } });
  });

  it('toggles a boolean Value', async () => {
    const flag = await createValue(rig(), { kind: 'boolean', name: 'Guest mode', value: false });
    const toggled = await rig().request(API_ENDPOINTS.applyAutomationValueOperation, {
      params: { valueId: flag.id },
      body: { kind: 'boolean', operation: { type: 'toggle' } },
    });
    expect(toggled.content).toMatchObject({ value: true });
  });

  it('rejects a number outside its bounds and leaves the Value unchanged', async () => {
    const level = await numberValue(rig(), 'Level', 8, { minimum: 0, maximum: 10 });
    const refusal = await rig().refused(API_ENDPOINTS.applyAutomationValueOperation, {
      params: { valueId: level.id },
      body: { kind: 'number', operation: { type: 'add', value: 5 } },
    });
    expect(refusal.status).toBe(400);
    const [kept] = await rig().request(API_ENDPOINTS.listAutomationValues);
    expect(kept).toMatchObject({ revision: 1, content: { value: 8 } });
  });

  it('clamps to the nearest bound when overflow is clamp', async () => {
    const level = await numberValue(rig(), 'Level', 8, {
      minimum: 0,
      maximum: 10,
      overflow: 'clamp',
    });
    const changed = await rig().request(API_ENDPOINTS.applyAutomationValueOperation, {
      params: { valueId: level.id },
      body: { kind: 'number', operation: { type: 'add', value: 5 } },
    });
    expect(changed.content).toMatchObject({ value: 10 });
  });

  it('wraps around the range in steps of its quantum when overflow is wrap', async () => {
    const level = await numberValue(rig(), 'Level', 9, {
      minimum: 0,
      maximum: 10,
      quantum: 1,
      overflow: 'wrap',
    });
    const changed = await rig().request(API_ENDPOINTS.applyAutomationValueOperation, {
      params: { valueId: level.id },
      body: { kind: 'number', operation: { type: 'add', value: 3 } },
    });
    expect(changed.content).toMatchObject({ value: 1 });
  });

  it('moves a choice Value to the next and previous choice and wraps at the ends', async () => {
    const [a, b, c] = [CHOICE_A, CHOICE_B, CHOICE_C].map((id) => AUTOMATION_CHOICE_ID.parse(id));
    const mode = await createValue(rig(), {
      kind: 'choice',
      name: 'Scene',
      value: a ?? AUTOMATION_CHOICE_ID.parse(CHOICE_A),
      choices: [a, b, c].map((id, index) => ({
        id: id ?? AUTOMATION_CHOICE_ID.parse(CHOICE_A),
        label: `Choice ${String(index + 1)}`,
      })),
      overflow: 'wrap',
    });
    const move = async (type: 'next' | 'previous'): Promise<unknown> => {
      const row = await rig().request(API_ENDPOINTS.applyAutomationValueOperation, {
        params: { valueId: mode.id },
        body: { kind: 'choice', operation: { type } },
      });
      return row.content.kind === 'choice' ? row.content.value : null;
    };
    expect([
      await move('next'),
      await move('next'),
      await move('next'),
      await move('previous'),
    ]).toStrictEqual([CHOICE_B, CHOICE_C, CHOICE_A, CHOICE_C]);
  });

  it('changes a Value from an automation step', async () => {
    const flag = await createValue(rig(), { kind: 'boolean', name: 'Guest mode', value: false });
    const row = await createAutomation(rig(), 'Flip', {
      actions: [
        {
          type: 'value_update',
          nodeId: nodeId(),
          valueId: flag.id,
          operation: { kind: 'boolean', operation: { type: 'set', value: true } },
        },
      ],
    });
    await startAndFinish(rig(), row.id);
    const [now] = await rig().request(API_ENDPOINTS.listAutomationValues);
    expect(now?.content).toMatchObject({ value: true });
  });

  it('refuses an update made against an outdated revision', async () => {
    const level = await numberValue(rig(), 'Level', 5);
    await rig().request(API_ENDPOINTS.applyAutomationValueOperation, {
      params: { valueId: level.id },
      body: { kind: 'number', operation: { type: 'set', value: 6 } },
    });
    const refusal = await rig().refused(API_ENDPOINTS.updateAutomationValue, {
      params: { valueId: level.id },
      body: { content: { ...level.content, name: 'Renamed' }, expectedRevision: 1 },
    });
    expect(refusal.status).toBe(409);
  });

  it('updates a Value without naming its revision', async () => {
    const level = await numberValue(rig(), 'Level', 5);
    const updated = await rig().request(API_ENDPOINTS.updateAutomationValue, {
      params: { valueId: level.id },
      body: { content: { ...level.content, name: 'Renamed' } },
    });
    expect(updated).toMatchObject({ revision: 2, content: { name: 'Renamed' } });
  });

  it('refuses to delete a Value that an automation still uses', async () => {
    const level = await numberValue(rig(), 'Level', 5);
    await createAutomation(rig(), 'Uses it', {
      conditions: {
        mode: 'all',
        items: [{ type: 'value', valueId: level.id, comparison: { operator: 'gt', value: 1 } }],
      },
      actions: [setPower(rig().ids.lamp, true)],
    });
    const refusal = await rig().refused(API_ENDPOINTS.removeAutomationValue, {
      params: { valueId: level.id },
    });
    expect(refusal.status).toBe(409);
    expect(refusal.message).toContain('referenced by automation Uses it');
  });

  it('is a signal: a change of the Value starts an automation that watches it', async () => {
    const level = await numberValue(rig(), 'Level', 5);
    await createAutomation(rig(), 'Watches', {
      triggers: [
        {
          type: 'signal',
          source: 'automation_value',
          kind: 'changed',
          subject: level.id,
          field: 'value',
        },
      ],
      actions: [setPower(rig().ids.lamp, true)],
    });
    await rig().request(API_ENDPOINTS.applyAutomationValueOperation, {
      params: { valueId: level.id },
      body: { kind: 'number', operation: { type: 'set', value: 6 } },
    });
    await rig().until(() => rig().commands().length === 1);
    expect(rig().commands()).toHaveLength(1);
  });

  it('is a signal: the status of a run starts an automation that watches for it', async () => {
    const first = await createAutomation(rig(), 'First', {
      actions: [setPower(rig().ids.lamp, true)],
    });
    await createAutomation(rig(), 'After first', {
      triggers: [
        {
          type: 'signal',
          source: 'automation_run',
          kind: 'status',
          subject: first.id,
          match: { status: 'succeeded' },
        },
      ],
      actions: [setPower(rig().ids.lampTwo, true)],
    });
    await startAndFinish(rig(), first.id);
    await rig().until(() => rig().commands().length === 2);
    expect(rig().sent()).toStrictEqual([
      ['lamp-1', 'power', true],
      ['lamp-2', 'power', true],
    ]);
    expect(await finishedRuns(rig(), first.id)).toHaveLength(1);
  });
});
