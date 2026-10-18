import { API_ENDPOINTS } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { inheritedOrigin } from '../../src/assistant/turn-authority';
import { createAutomation, definitionOf, setPower, type Steps } from './support/programs';
import { callSequence, createSequence } from './support/sequences';
import { useRig } from './support/use-rig';

const rig = useRig();

function wake(): Steps[number] {
  return { type: 'wake_ai', profileId: rig().profileId, chatId: null, instruction: 'Look around' };
}

function tool(): Steps[number] {
  return {
    type: 'tool',
    profileId: rig().profileId,
    tool: 'control_devices',
    args: {
      changes: [{ target: { deviceIds: [rig().ids.lamp] }, capability: 'power', value: true }],
    },
  };
}

describe('C28 plugin origin tracking', () => {
  it('stores the origin chosen by the server and refuses one claimed in the request', async () => {
    const definition = definitionOf({ actions: [setPower(rig().ids.lamp, true)] });
    const refusal = await rig().refused(API_ENDPOINTS.createAutomation, {
      body: {
        name: 'Claims',
        definition: Object.assign({}, definition, {
          origin: { plugin_id: 'fake-plugin', requester: 'owner' },
        }),
      },
    });
    expect(refusal.status).toBe(400);
    const row = await rig().request(API_ENDPOINTS.createAutomation, {
      body: { name: 'Plain', definition },
    });
    expect(row.origin).toBeNull();
  });

  it('combines origins to the least trusted requester and refuses ambiguous plugins', () => {
    expect(
      inheritedOrigin([
        { plugin_id: 'syncthing', requester: 'owner' },
        { plugin_id: 'syncthing', requester: 'unlisted' },
        { plugin_id: null, requester: 'approved' },
      ]),
    ).toStrictEqual({ plugin_id: 'syncthing', requester: 'unlisted' });
    expect(() =>
      inheritedOrigin([
        { plugin_id: 'syncthing', requester: 'owner' },
        { plugin_id: 'adguard', requester: 'owner' },
      ]),
    ).toThrow('ambiguous initiating plugins');
  });
});

describe('C29 AI steps need an owner', () => {
  it('lets an owner save a step that wakes the AI or calls a tool', async () => {
    const row = await createAutomation(rig(), 'Owner AI', { actions: [wake(), tool()] });
    expect(row.definition['steps']).toHaveLength(2);
  });

  it.each([
    ['wakes the AI', wake],
    ['calls a tool', tool],
  ])('refuses a member who saves a step that %s', async (_name, step) => {
    const member = await rig().member();
    const refusal = await member.refused(API_ENDPOINTS.createAutomation, {
      body: { name: 'Member AI', definition: definitionOf({ actions: [step()] }) },
    });
    expect(refusal.status).toBe(403);
    expect(refusal.message).toContain('Only an owner');
  });

  it('refuses a member who saves reusable steps with such a step or calls them', async () => {
    const member = await rig().member();
    const reusable = await createSequence(rig(), 'Owner steps', { actions: [tool()] });
    const refusals = await Promise.all([
      member.refused(API_ENDPOINTS.createAutomation, {
        body: {
          name: 'Member steps',
          definition: definitionOf({ actions: [tool()] }),
        },
      }),
      member.refused(API_ENDPOINTS.createAutomation, {
        body: {
          name: 'Member caller',
          definition: definitionOf({ actions: [callSequence(reusable.id)] }),
        },
      }),
    ]);
    expect(refusals.map((refusal) => refusal.status)).toStrictEqual([403, 403]);
  });

  it('refuses a member who runs a saved automation with such a step, also through a sequence', async () => {
    const direct = await createAutomation(rig(), 'Direct', { actions: [tool()] });
    const sequence = await createSequence(rig(), 'Hidden', { actions: [tool()] });
    const indirect = await createAutomation(rig(), 'Indirect', {
      actions: [callSequence(sequence.id)],
    });
    const member = await rig().member();
    const refusals = await Promise.all(
      [direct.id, indirect.id].map((automationId) =>
        member.refused(API_ENDPOINTS.runAutomation, { params: { automationId } }),
      ),
    );
    expect(refusals.map((refusal) => refusal.status)).toStrictEqual([403, 403]);
    expect(refusals[0]?.message).toContain('Only an owner may run');
    expect(rig().commands()).toHaveLength(0);
  });

  it('lets a member run an automation without such steps', async () => {
    const row = await createAutomation(rig(), 'Plain', {
      actions: [setPower(rig().ids.lamp, true)],
    });
    const member = await rig().member();
    await member.request(API_ENDPOINTS.runAutomation, { params: { automationId: row.id } });
    expect(rig().sent()).toStrictEqual([['lamp-1', 'power', true]]);
  });
});
