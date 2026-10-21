import { describe, expect, it } from 'vitest';
import { ApiError, HARNESS_CENTRAL_CONTEXT, HARNESS_CENTRAL_RESULT } from '@smarteverything/domain';
import type { HarnessTransportRequest } from '@smarteverything/domain';
import { ToolHub } from '../../../src/ai-tools/tool-hub';
import type { HubTool, HubToolResult } from '../../../src/ai-tools/hub-tool';
import { bindCentralHarness, centralTransport } from '../../../src/harness/central-transport';
import { HarnessHubTools } from '../../../src/harness/tools';
import { useRig, type Rig } from './support/rig';

let rig: Rig;
useRig((made) => {
  rig = made;
});

const PING: HubTool = {
  name: 'ping',
  title: 'ping',
  description: 'Echo the text back.',
  inputSchema: { type: 'object', properties: { text: { type: 'string' } } },
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  origin: { kind: 'se' },
  humanOnly: false,
};

function installed(now: () => Date, ran: string[]): void {
  const hub = new ToolHub([
    {
      tools: (): HubTool[] => [PING],
      call: (_tool, args): Promise<HubToolResult> => {
        ran.push(String(args['text']));
        return Promise.resolve({ response: { echoed: args['text'] }, line: '', pictures: [] });
      },
      validate: (): null => null,
      changes: (): (() => void) => (): void => undefined,
    },
  ]);
  bindCentralHarness(rig.service, new HarnessHubTools(rig.service, hub), now);
}

function session(): {
  readonly send: (request: HarnessTransportRequest['request']) => Promise<unknown>;
  readonly claim: ReturnType<Rig['service']['prepare']>['claim'];
} {
  const chat = rig.newChat(rig.desk.target);
  const open = rig.service.prepare(rig.owner, chat.id, rig.authority, rig.clientId);
  const host = rig.service.directory.get(rig.desk.target).host;
  if (rig.desk.target.kind !== 'device') throw new Error('The desk is a device.');
  const binding = {
    device_id: rig.desk.target.device_id,
    generation: host.connection_generation,
    runtime_instance: host.runtime_instance,
  };
  return {
    claim: open.claim,
    send: (request) => centralTransport(rig.service, { ...binding, request }),
  };
}

describe('a hub tool called by a chat on another computer', () => {
  it('runs each call the writer makes, even when the same call is made again', async () => {
    const ran: string[] = [];
    installed(() => new Date(), ran);
    const { send, claim } = session();
    const call = { operation: 'tool', claim, name: 'ping', arguments: { text: 'a' } } as const;

    const first = HARNESS_CENTRAL_RESULT.parse(await send(call));
    const second = HARNESS_CENTRAL_RESULT.parse(await send(call));

    expect(first.response).toStrictEqual({ echoed: 'a' });
    expect(second.response).toStrictEqual({ echoed: 'a' });
    expect(ran).toStrictEqual(['a', 'a']);
  });

  it('refuses a claim that is not the current writer of the session', async () => {
    const ran: string[] = [];
    installed(() => new Date(), ran);
    const { send, claim } = session();

    await expect(
      send({
        operation: 'tool',
        claim: { ...claim, epoch: claim.epoch + 1 },
        name: 'ping',
        arguments: { text: 'a' },
      }),
    ).rejects.toMatchObject({ code: 'ownership-lost' });
    expect(ran).toStrictEqual([]);
  });
});

describe('a tool call from a runtime that is not the granted host', () => {
  it('fails with its own error, not as lost ownership of the session', () => {
    const { claim } = session();
    const host = rig.service.directory.get(rig.desk.target).host;
    if (rig.desk.target.kind !== 'device') throw new Error('The desk is a device.');
    const verify = (): unknown =>
      rig.service.storage.verify(claim, {
        device_id: rig.desk.target.kind === 'device' ? rig.desk.target.device_id : '',
        generation: host.connection_generation,
        runtime_instance: 'another-runtime',
      });

    expect(verify).toThrow(ApiError);
    expect(verify).not.toThrow(expect.objectContaining({ code: 'ownership_lost' }));
  });
});

describe('the prompt a chat on another computer receives', () => {
  it('keeps the system prompt the same as time passes and carries the time in the turn facts', async () => {
    let now = new Date('2026-10-17T09:00:00.000Z');
    installed(() => now, []);
    const { send, claim } = session();

    const early = HARNESS_CENTRAL_CONTEXT.parse(await send({ operation: 'context', claim }));
    now = new Date('2026-10-17T09:07:00.000Z');
    const later = HARNESS_CENTRAL_CONTEXT.parse(await send({ operation: 'context', claim }));

    expect(later.system).toBe(early.system);
    expect(early.system).not.toContain('Local time');
    expect(early.turn).toContain('Local time');
    expect(later.turn).not.toBe(early.turn);
  });

  it('names the primary folder only in the machine context, not in the hub prompt', async () => {
    installed(() => new Date(), []);
    const { send, claim } = session();

    const context = HARNESS_CENTRAL_CONTEXT.parse(await send({ operation: 'context', claim }));

    expect(`${context.system}\n${context.turn}`).not.toContain('Primary machine folder');
    expect(`${context.system}\n${context.turn}`).not.toContain('project_read');
  });
});
