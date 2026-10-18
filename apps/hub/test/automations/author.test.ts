import { API_ENDPOINTS } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { callTool, structured } from '../mcp/client';
import { createAutomation, definitionOf, setPower } from './support/programs';
import { useRig } from './support/use-rig';

const rig = useRig();

describe('who made an automation', () => {
  it('records the person who saved it in the app', async () => {
    const row = await createAutomation(rig(), 'By hand', {
      actions: [setPower(rig().ids.lamp, true)],
    });
    expect(row.author).toStrictEqual({ via: 'person', profile_id: rig().profileId });
  });

  it('records that the AI made one it created through a tool', async () => {
    structured(
      await callTool(rig().booted.base, await rig().mcp(), 'edit_automation', {
        action: 'create',
        name: 'By AI',
        definition: definitionOf({ actions: [setPower(rig().ids.lamp, true)] }),
      }),
    );
    const listed = await rig().request(API_ENDPOINTS.listAutomations);
    expect(listed.find((row) => row.name === 'By AI')?.author).toStrictEqual({
      via: 'assistant',
      profile_id: rig().profileId,
    });
  });

  it('keeps the author when the automation is renamed', async () => {
    const row = await createAutomation(rig(), 'Before', {
      actions: [setPower(rig().ids.lamp, true)],
    });
    const renamed = await rig().request(API_ENDPOINTS.updateAutomation, {
      params: { automationId: row.id },
      body: { name: 'After' },
    });
    expect(renamed.author).toStrictEqual(row.author);
  });
});

describe('the tools a tool step can call', () => {
  it('lists each tool with its exact input schema, as the AI sees them', async () => {
    const tools = await rig().request(API_ENDPOINTS.listAutomationTools);
    const control = tools.find((tool) => tool.name === 'control_devices');
    expect(control?.input_schema).toMatchObject({ type: 'object' });
    expect(control?.read_only).toBe(false);
    expect(tools.some((tool) => tool.name === 'list_automations' && tool.read_only)).toBe(true);
  });
});
