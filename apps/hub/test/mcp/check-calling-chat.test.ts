import { describe, expect, it } from 'vitest';
import { ToolHub } from '../../src/ai-tools/tool-hub';
import { SE_TOOLS } from '../../src/ai-tools/se-tools';
import {
  failure,
  type HubTool,
  type HubToolResult,
  type ToolCaller,
} from '../../src/ai-tools/hub-tool';
import { operationShape } from '../../src/extensions/mcp/tools/operation-shape';
import { withCallingChat } from '../../src/extensions/mcp/tools/operation-tools';
import { ToolError } from '../../src/extensions/mcp/tools/registry';

const CHAT = '3f1b2c8e-6f0a-4c1e-9a52-0d1c1f4e7a10';
const SHAPE = operationShape('editEmbeddedBrowser');

const caller: ToolCaller = {
  profileId: CHAT,
  role: 'owner',
  chatId: CHAT,
  via: 'chat',
  clientId: null,
};

const hub = new ToolHub([
  {
    tools: (): readonly HubTool[] => SE_TOOLS.filter((tool) => tool.name === 'browser_control'),
    call: (): Promise<HubToolResult> => Promise.resolve(failure('not called')),
    validate: (_tool, args, asking): string | null => {
      try {
        withCallingChat({ actor: asking ?? null }, SHAPE, args);
        return null;
      } catch (cause) {
        if (cause instanceof ToolError) return cause.message;
        throw cause;
      }
    },
    changes: () => (): void => undefined,
  },
]);

describe('checking a chat tool before it runs', () => {
  const open = { action: { kind: 'open', port: 5173 } };

  it('checks browser_control called through tool_call with the calling chat', () => {
    expect(hub.check('tool_call', { name: 'browser_control', arguments: open }, caller)).toEqual(
      expect.objectContaining({ ok: true }),
    );
  });

  it('asks for a chat id only when there is no calling chat', () => {
    const checked = hub.check('browser_control', open);
    expect(checked.ok ? '' : checked.reason).toContain('chatId is needed');
  });
});
