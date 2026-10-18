import { API_ENDPOINTS, AUTOMATION_VALUE_ID } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { createAutomation, definitionOf, setPower, type Program } from './support/programs';
import { callSequence, createSequence } from './support/sequences';
import { useRig } from './support/use-rig';
import { numberValue } from './support/values';

const rig = useRig();

function lampOn(): Program {
  return { actions: [setPower(rig().ids.lamp, true)] };
}

async function revisionOf(id: string): Promise<number> {
  const rows = await rig().request(API_ENDPOINTS.listAutomations);
  const row = rows.find((candidate) => candidate.id === id);
  if (row === undefined) throw new Error('The automation is missing.');
  return row.revision;
}

describe('C27 optimistic concurrency for edits', () => {
  it('numbers the first save 1 and moves the number on a rename or a switch off', async () => {
    const row = await createAutomation(rig(), 'Stable', lampOn());
    expect(row.revision).toBe(1);
    expect(await revisionOf(row.id)).toBe(1);
    await rig().request(API_ENDPOINTS.updateAutomation, {
      params: { automationId: row.id },
      body: { name: 'Renamed', enabled: false },
    });
    expect(await revisionOf(row.id)).toBe(2);
  });

  it('saves a new definition at the current revision and moves the revision on', async () => {
    const row = await createAutomation(rig(), 'Edited', lampOn());
    const updated = await rig().request(API_ENDPOINTS.updateAutomation, {
      params: { automationId: row.id },
      body: {
        definition: definitionOf({ actions: [setPower(rig().ids.lamp, false)] }),
        expectedRevision: row.revision,
      },
    });
    expect(updated.revision).toBe(row.revision + 1);
    expect(await revisionOf(row.id)).toBe(2);
  });

  it('refuses a save made against an outdated revision and keeps the stored definition', async () => {
    const row = await createAutomation(rig(), 'Contested', lampOn());
    const changed = await rig().request(API_ENDPOINTS.updateAutomation, {
      params: { automationId: row.id },
      body: {
        definition: definitionOf({ actions: [setPower(rig().ids.lamp, false)] }),
        expectedRevision: row.revision,
      },
    });
    const refusal = await rig().refused(API_ENDPOINTS.updateAutomation, {
      params: { automationId: row.id },
      body: {
        definition: definitionOf({ actions: [setPower(rig().ids.lampTwo, true)] }),
        expectedRevision: row.revision,
      },
    });
    expect(refusal.status).toBe(409);
    expect(refusal.message).toContain('changed since it was read');
    const [kept] = (await rig().request(API_ENDPOINTS.listAutomations)).filter(
      (candidate) => candidate.id === row.id,
    );
    expect(kept?.definition).toStrictEqual(changed.definition);
  });

  it('lets any program be replaced without naming a revision', async () => {
    const level = await numberValue(rig(), 'Level', 5);
    const row = await createAutomation(rig(), 'Structured', {
      conditions: {
        mode: 'all',
        items: [{ type: 'value', valueId: level.id, comparison: { operator: 'gt', value: 1 } }],
      },
      runPolicy: { mode: 'single' },
      actions: [setPower(rig().ids.lamp, true)],
    });
    const updated = await rig().request(API_ENDPOINTS.updateAutomation, {
      params: { automationId: row.id },
      body: { definition: definitionOf({ actions: [setPower(rig().ids.lampTwo, true)] }) },
    });
    expect(updated.definition['steps']).toHaveLength(1);
    expect(updated.revision).toBe(2);
  });

  it('removes reusable steps without a revision and refuses while another automation runs them', async () => {
    const sequence = await createSequence(rig(), 'Used', {
      actions: [setPower(rig().ids.lamp, true)],
    });
    const caller = await createAutomation(rig(), 'Caller', {
      actions: [callSequence(sequence.id)],
    });
    const refusal = await rig().refused(API_ENDPOINTS.removeAutomation, {
      params: { automationId: sequence.id },
    });
    expect(refusal.status).toBe(409);
    expect(refusal.message).toContain('runs this automation');
    await rig().request(API_ENDPOINTS.removeAutomation, { params: { automationId: caller.id } });
    await rig().request(API_ENDPOINTS.removeAutomation, { params: { automationId: sequence.id } });
    expect(await rig().request(API_ENDPOINTS.listAutomations)).toHaveLength(0);
  });
});

describe('C27 references stay valid', () => {
  it('refuses to save a program that uses a Value that does not exist', async () => {
    const refusal = await rig().refused(API_ENDPOINTS.createAutomation, {
      body: {
        name: 'Ghost',
        definition: definitionOf({
          conditions: {
            mode: 'all',
            items: [
              {
                type: 'value',
                valueId: AUTOMATION_VALUE_ID.parse('0d000000-0000-4000-8000-000000000009'),
                comparison: { operator: 'gt', value: 1 },
              },
            ],
          },
          actions: [setPower(rig().ids.lamp, true)],
        }),
      },
    });
    expect(refusal.status).toBe(400);
    expect(refusal.message).toContain('Nothing was saved');
  });
});
