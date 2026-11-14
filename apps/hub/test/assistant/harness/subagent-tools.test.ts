import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { SESSION_FORMAT_VERSION, SessionId } from '@deepseek-ai/dsh-session';
import type { SessionHeader } from '@deepseek-ai/dsh-session';
import { ToolHub } from '../../../src/ai-tools/tool-hub';
import type { HubTool, HubToolResult } from '../../../src/ai-tools/hub-tool';
import { HarnessHubTools } from '../../../src/harness/tools';
import { LocalHarnessPersistence } from '../../../src/harness/local-persistence';
import { harnessRig, type Rig } from './support/rig';

let rig: Rig | undefined;
afterEach(async () => {
  await rig?.close();
  rig = undefined;
});

function hubTool(name: string): HubTool {
  return {
    name,
    title: name,
    description: `The ${name} tool.`,
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    origin: { kind: 'se' },
    humanOnly: false,
  };
}

function hubOf(names: readonly string[]): ToolHub {
  return new ToolHub([
    {
      tools: (): HubTool[] => names.map(hubTool),
      call: (): Promise<HubToolResult> =>
        Promise.resolve({ response: { ran: true }, line: '', pictures: [] }),
      validate: (): null => null,
      changes: (): (() => void) => (): void => undefined,
    },
  ]);
}

function subagentHeader(parentSession: string): SessionHeader {
  return {
    version: SESSION_FORMAT_VERSION,
    id: SessionId(randomUUID()),
    createdAt: Date.now(),
    cwd: '/tmp/work',
    isSeeded: false,
    parentSession: SessionId(parentSession),
    origin: 'subagent',
    delegationDepth: 1,
  };
}

async function parentAndHelper(
  made: Rig,
  parentTools: readonly string[] | null,
): Promise<{ readonly parent: string; readonly helper: string }> {
  const chat = made.newChat(made.hub.target);
  if (parentTools !== null) made.opened.store.aiChats.update(chat.id, { tools: [...parentTools] });
  const open = made.service.prepare(made.owner, chat.id, made.authority, made.clientId);
  const persistence = new LocalHarnessPersistence(made.service);
  persistence.bind(open.claim);
  const header = subagentHeader(open.claim.session_id);
  await persistence.create(header, 0);
  return { parent: open.claim.session_id, helper: header.id };
}

function namesOf(access: HarnessHubTools, session: string): readonly string[] {
  return access
    .scoped(session)
    .list()
    .map((tool) => tool.name);
}

describe('the hub tools of a helper compared with its parent', () => {
  it('are the same list when the parent has no restriction', async () => {
    rig = await harnessRig();
    const { parent, helper } = await parentAndHelper(rig, null);
    const access = new HarnessHubTools(rig.service, hubOf(['home_read', 'device_control']));

    expect(namesOf(access, helper)).toStrictEqual(namesOf(access, parent));
    expect(access.declarationNames(helper)).toStrictEqual(access.declarationNames(parent));
    expect(namesOf(access, helper)).toStrictEqual(['device_control', 'home_read']);
  });

  it('keep tool discovery and drop only what the parent does not allow', async () => {
    rig = await harnessRig();
    const { helper } = await parentAndHelper(rig, ['home_read']);
    const access = new HarnessHubTools(rig.service, hubOf(['home_read', 'device_control']));

    const offered = namesOf(access, helper);
    expect(offered).toContain('home_read');
    expect(offered).not.toContain('device_control');
    expect(access.declarationNames(helper)).toContain('tool_search');
    expect(access.catalogue(helper).map((entry) => entry.name)).not.toContain('device_control');
  });

  it('refuse a tool the parent does not allow by name, through the generic call too', async () => {
    rig = await harnessRig();
    const { helper } = await parentAndHelper(rig, ['home_read']);
    const access = new HarnessHubTools(rig.service, hubOf(['home_read', 'device_control']));

    await expect(access.call(helper, 'device_control', {})).rejects.toThrow(/device_control/u);
    await expect(
      access.call(helper, 'tool_call', { name: 'device_control', arguments: {} }),
    ).rejects.toThrow(/device_control/u);
    await expect(access.call(helper, 'home_read', {})).resolves.toMatchObject({
      response: { ran: true },
    });
  });
});
