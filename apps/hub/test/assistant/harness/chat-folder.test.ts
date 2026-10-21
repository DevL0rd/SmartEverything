import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AiHarnessTarget } from '@smarteverything/domain';
import { ToolHub } from '../../../src/ai-tools/tool-hub';
import type { HubTool, HubToolResult } from '../../../src/ai-tools/hub-tool';
import { HarnessHubTools } from '../../../src/harness/tools';
import { useRig, type Rig } from './support/rig';

let rig: Rig;
useRig((made) => {
  rig = made;
});

function tool(name: string): HubTool {
  return {
    name,
    title: name,
    description: name,
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    origin: { kind: 'se' },
    humanOnly: false,
  };
}

function hubTools(): HarnessHubTools {
  const hub = new ToolHub([
    {
      tools: (): HubTool[] => [tool('home_read'), tool('project_read'), tool('project_edit')],
      call: (): Promise<HubToolResult> => Promise.resolve({ response: {}, line: '', pictures: [] }),
      validate: (): null => null,
      changes: (): (() => void) => (): void => undefined,
    },
  ]);
  return new HarnessHubTools(rig.service, hub);
}

function opened(target: AiHarnessTarget): ReturnType<Rig['service']['prepare']> {
  const chat = rig.newChat(target);
  return rig.service.prepare(rig.owner, chat.id, rig.authority, rig.clientId);
}

describe('where a chat starts working', () => {
  it('starts a hub chat in its own folder under the data folder', async () => {
    const open = opened(rig.hub.target);

    expect(open.cwd).toBe(join(rig.opened.directory, 'assistant', 'projects', open.chat_id));
    for (const area of ['workspace', 'temporary'])
      expect((await stat(join(open.cwd, area))).isDirectory()).toBe(true);
  });

  it('keeps the primary folder of the computer for a chat on a computer', () => {
    expect(opened(rig.desk.target).cwd).toBe('/home/test');
  });
});

describe('the file tools a chat is offered', () => {
  it('replaces the project file tools with the native tools on the hub only', () => {
    const tools = hubTools();
    const onHub = opened(rig.hub.target);
    const onDesk = opened(rig.desk.target);

    const names = (id: string): string[] =>
      tools
        .scoped(id)
        .list()
        .map((entry) => entry.name)
        .sort();

    expect(names(onHub.claim.session_id)).toStrictEqual(['home_read']);
    expect(names(onDesk.claim.session_id)).toStrictEqual([
      'home_read',
      'project_edit',
      'project_read',
    ]);
  });
});
