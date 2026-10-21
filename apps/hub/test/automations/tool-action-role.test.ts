import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { withExecutionAuthority } from '../../src/assistant/turn-authority';
import { callTool } from '../../src/automations/effects/tool';
import type { ToolCheck, ToolHub } from '../../src/ai-tools/tool-hub';
import type { HubTool, HubToolResult, ToolCaller } from '../../src/ai-tools/hub-tool';
import type { ConversationAuthority } from '../../src/harness/authority-contract';

const ACTION = {
  type: 'tool',
  profileId: randomUUID(),
  tool: 'computer_use',
  args: { deviceId: randomUUID(), action: 'click', x: 1, y: 2 },
} as const;

const ORIGIN = { automationId: randomUUID(), name: 'Night', signal: null, plugin: null };

const TOOL: HubTool = {
  name: 'computer_use',
  title: 'Use the mouse and keyboard',
  description: 'x',
  inputSchema: {},
  annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
  origin: { kind: 'se' },
  humanOnly: false,
};

function hub(callers: ToolCaller[]): Pick<ToolHub, 'check' | 'call'> {
  return {
    check: (): ToolCheck => ({ ok: true, tool: TOOL }),
    call: (_name, _args, caller): Promise<HubToolResult> => {
      callers.push(caller);
      return Promise.resolve({ response: {}, line: '', pictures: [] });
    },
  };
}

function authority(
  role: 'owner' | 'member',
  requester: ConversationAuthority['requester'] = null,
): ConversationAuthority {
  return {
    event_id: randomUUID(),
    profile_id: randomUUID(),
    client_id: null,
    kind: 'service',
    role,
    hub_os_ban: false,
    tools: null,
    plugin_id: null,
    requester,
  };
}

describe('the role a tool step runs with', () => {
  it('is owner for a home run with no initiating person', async () => {
    const callers: ToolCaller[] = [];
    await callTool(hub(callers), ACTION, ORIGIN);
    expect(callers.map((caller) => caller.role)).toEqual(['owner']);
  });

  it('follows the person who started the run, so a member cannot reach another person’s computer', async () => {
    const callers: ToolCaller[] = [];
    await withExecutionAuthority(authority('member'), () => callTool(hub(callers), ACTION, ORIGIN));
    await withExecutionAuthority(authority('owner'), () => callTool(hub(callers), ACTION, ORIGIN));
    await withExecutionAuthority(authority('owner', 'unlisted'), () =>
      callTool(hub(callers), ACTION, ORIGIN),
    );
    expect(callers.map((caller) => caller.role)).toEqual(['member', 'owner', 'member']);
  });

  it('refuses a step the tools would refuse', async () => {
    const refusing: Pick<ToolHub, 'check' | 'call'> = {
      check: () => ({ ok: false, reason: 'switched off' }),
      call: () => Promise.reject(new Error('unused')),
    };
    await expect(callTool(refusing, ACTION, ORIGIN)).rejects.toThrow('switched off');
  });

  it('turns a tool error answer into a failed step', async () => {
    const failing: Pick<ToolHub, 'check' | 'call'> = {
      check: () => ({ ok: true, tool: TOOL }),
      call: () => Promise.resolve({ response: { error: 'Nope' }, line: '', pictures: [] }),
    };
    await expect(callTool(failing, ACTION, ORIGIN)).rejects.toThrow(
      'Use the mouse and keyboard: Nope',
    );
  });
});
