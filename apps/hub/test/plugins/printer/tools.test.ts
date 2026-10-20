import { describe, expect, it } from 'vitest';
import { harnessToolSchema } from '../../../src/harness/tool-schema';
import { printerTools } from '../../../src/plugins/builtin/printer/tools';
import { OWNER } from './service-rig';

const tools = printerTools({
  read: (): Readonly<Record<string, unknown>> => ({ ok: true }),
  act: (raw: unknown): Promise<Readonly<Record<string, unknown>>> =>
    Promise.resolve({ received: JSON.stringify(raw) }),
});

describe('printer tools', () => {
  it('declare object schemas the AI harness accepts', () => {
    expect(tools.map((tool) => tool.name)).toEqual(['printer', 'printer_action']);
    for (const tool of tools) {
      expect(() => harnessToolSchema(tool.inputSchema)).not.toThrow();
      expect(tool.inputSchema).toMatchObject({ type: 'object' });
    }
  });

  it('run an action with the fields of its kind and name what is missing', async () => {
    const action = tools.find((tool) => tool.name === 'printer_action');
    if (action === undefined) throw new Error('The action tool is missing.');
    expect(action.validate({ action: 'cancel', job: 'k' })).toBeNull();
    expect(action.validate({ action: 'cancel' })).toContain('job');
    const done = await action.run({ action: 'pause', printer: 'hall' }, OWNER);
    expect(JSON.stringify(done)).toContain('pause');
    const refused = await action.run({ action: 'cancel' }, OWNER);
    expect(JSON.stringify(refused)).toContain('not valid');
  });
});
