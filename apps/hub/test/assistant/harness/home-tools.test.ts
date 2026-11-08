import { describe, expect, it } from 'vitest';
import { ToolHub } from '../../../src/ai-tools/tool-hub';
import type { HubTool, HubToolResult, ToolCaller } from '../../../src/ai-tools/hub-tool';
import { HubHomeTools } from '../../../src/harness/central-transport';
import { centralHomeTools, centralToolCatalogue } from '../../../src/harness/tool-declarations';
import { HarnessHubTools } from '../../../src/harness/tools';
import { currentRequestSignal } from '../../../src/server/request-signal';
import { useRig, type Rig } from './support/rig';

let rig: Rig;
useRig((made) => {
  rig = made;
});

function tool(name: string, readOnlyHint: boolean): HubTool {
  return {
    name,
    title: name,
    description: `The ${name} tool.`,
    inputSchema: { type: 'object', properties: { text: { type: 'string' } } },
    annotations: { readOnlyHint, destructiveHint: !readOnlyHint, openWorldHint: false },
    origin: { kind: 'se' },
    humanOnly: false,
  };
}

const PICTURE = Buffer.from([137, 80, 78, 71]);

interface Fixture {
  readonly hub: ToolHub;
  readonly callers: ToolCaller[];
}

function fixture(beforeResult: () => Promise<void> = async () => undefined): Fixture {
  const callers: ToolCaller[] = [];
  const tools = [
    tool('home_read', true),
    tool('device_control', false),
    tool('camera_snapshot', true),
    tool('broken', true),
  ];
  const hub = new ToolHub([
    {
      tools: (): HubTool[] => tools,
      call: async (entry, args, caller): Promise<HubToolResult> => {
        callers.push(caller);
        await beforeResult();
        if (entry.name === 'broken')
          return { response: { error: 'It is broken.' }, line: '', pictures: [] };
        return {
          response: { echoed: args['text'] ?? null },
          line: '',
          pictures:
            entry.name === 'camera_snapshot' ? [{ data: PICTURE, mimeType: 'image/png' }] : [],
        };
      },
      validate: (): null => null,
      changes: (): (() => void) => (): void => undefined,
    },
  ]);
  return { hub, callers };
}

function safe(hub: ToolHub, name: string, args: Readonly<Record<string, unknown>>): boolean {
  const found = centralHomeTools(hub).find((entry) => entry.name === name);
  if (found === undefined) throw new Error(`${name} is not offered.`);
  return found.concurrencySafe(args);
}

describe('which hub tool calls may run in parallel', () => {
  it('marks a read-only tool safe and a mutating tool exclusive', () => {
    const { hub } = fixture();

    expect(safe(hub, 'home_read', {})).toBe(true);
    expect(safe(hub, 'camera_snapshot', {})).toBe(true);
    expect(safe(hub, 'device_control', {})).toBe(false);
  });

  it('classifies the tool_call tool by the tool it forwards to', () => {
    const { hub } = fixture();

    expect(safe(hub, 'tool_call', { name: 'home_read', arguments: {} })).toBe(true);
    expect(safe(hub, 'tool_call', { name: 'device_control', arguments: {} })).toBe(false);
  });

  it('keeps tool_call exclusive for an unknown, discovery or malformed target', () => {
    const { hub } = fixture();

    expect(safe(hub, 'tool_call', { name: 'missing_tool', arguments: {} })).toBe(false);
    expect(safe(hub, 'tool_call', { name: 'tool_search', arguments: {} })).toBe(false);
    expect(safe(hub, 'tool_call', { name: 'home_read' })).toBe(false);
    expect(safe(hub, 'tool_call', {})).toBe(false);
  });
});

describe('the read-only classification the catalogue carries to a computer', () => {
  it('marks each tool and lists the read-only targets of tool_call', () => {
    const { hub } = fixture();
    const catalogue = centralToolCatalogue(hub);
    const entry = (name: string): (typeof catalogue)[number] | undefined =>
      catalogue.find((tool) => tool.name === name);

    expect(entry('home_read')?.read_only).toBe(true);
    expect(entry('device_control')?.read_only).toBe(false);
    expect(entry('home_read')?.read_only_targets).toBeUndefined();
    expect(entry('tool_call')?.read_only).toBe(false);
    expect(entry('tool_call')?.read_only_targets).toStrictEqual([
      'broken',
      'camera_snapshot',
      'home_read',
    ]);
  });
});

describe('the hub transport of the home tools', () => {
  function transport(
    beforeResult?: () => Promise<void>,
  ): { readonly home: HubHomeTools; readonly session: string } & Fixture {
    const made = fixture(beforeResult);
    const chat = rig.newChat(rig.hub.target);
    const open = rig.service.prepare(rig.owner, chat.id, rig.authority, rig.clientId);
    const access = new HarnessHubTools(rig.service, made.hub);
    return { ...made, home: new HubHomeTools(access, made.hub), session: open.claim.session_id };
  }

  function request(
    session: string,
    name: string,
    args: Record<string, string> = {},
  ): Parameters<HubHomeTools['call']>[0] {
    return {
      sessionId: session,
      callId: 'call-1',
      name,
      arguments: args,
      signal: new AbortController().signal,
    };
  }

  it('runs a call as the session caller and returns the response as it is', async () => {
    const { home, session, callers } = transport();

    const result = await home.call(request(session, 'home_read', { text: 'hello there' }));

    expect(result).toStrictEqual({ response: { echoed: 'hello there' }, pictures: [] });
    expect(callers).toHaveLength(1);
    expect(callers[0]).toMatchObject({
      callId: 'call-1',
      role: 'owner',
      via: 'chat',
      profileId: rig.owner.profileId,
    });
  });

  it('returns pictures as base64 with their media type', async () => {
    const { home, session } = transport();

    const result = await home.call(request(session, 'camera_snapshot'));

    expect(result.pictures).toStrictEqual([
      { mediaType: 'image/png', data: PICTURE.toString('base64') },
    ]);
  });

  it('fails a call whose tool answered with an error', async () => {
    const { home, session } = transport();

    await expect(home.call(request(session, 'broken'))).rejects.toThrow('It is broken.');
  });

  it('propagates a stopped hub turn to asynchronous tool work', async () => {
    const stopped = new AbortController();
    const { home, session } = transport(async () => {
      await Promise.resolve();
      stopped.abort(new Error('The hub turn stopped.'));
      const signal = currentRequestSignal();
      expect(signal).toBe(stopped.signal);
      signal?.throwIfAborted();
    });

    await expect(
      home.call({ ...request(session, 'home_read'), signal: stopped.signal }),
    ).rejects.toThrow('The hub turn stopped.');
  });

  it('offers the tool list once per change and the declared names per session', async () => {
    const { home, session } = transport();

    const first = home.tools();
    const offered = await home.session(session);

    expect(home.tools()).toBe(first);
    expect(offered.tools).toBe(first);
    expect(offered.prompt).toBeUndefined();
    expect(first.map((entry) => entry.name)).toContain('tool_call');
    expect(offered.declared).toContain('tool_call');
  });
});
