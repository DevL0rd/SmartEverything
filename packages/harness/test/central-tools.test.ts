import { afterEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { HarnessCallRequest } from '@smarteverything/domain/node/harness-frames';
import type { GenerateOptions } from '@deepseek-ai/dsh-llm';
import { CentralHarnessTools } from '../src/process/central-tools';
import { HarnessHub, type HarnessCallPort } from '../src/process/http';
import { HARNESS_BOOT } from '../src/process/boot';
import { bootDispatcher } from './support/dispatcher';
import type { DispatcherFixture } from './support/dispatcher';

const PING = {
  name: 'ping',
  description: 'Echo the text back.',
  parameters: { type: 'object', properties: { text: { type: 'string' } } },
};

class Hub implements HarnessCallPort {
  readonly requests: HarnessCallRequest[] = [];
  private contexts = 0;

  call(request: HarnessCallRequest): Promise<unknown> {
    this.requests.push(request);
    return Promise.resolve(this.answer(request));
  }

  private answer(request: HarnessCallRequest): unknown {
    if (request.operation === 'tools') return [PING];
    if (request.operation === 'context')
      return {
        system: 'You are the home AI.',
        turn: `Local time: Saturday 09:0${String(this.contexts++)}`,
        tools: [PING],
        declared_tool_names: ['ping'],
        compact_at_percent: 80,
      };
    if (request.operation === 'tool')
      return { response: { echoed: request.arguments['text'] }, pictures: [] };
    throw new Error(`Unexpected ${request.operation}.`);
  }
}

function http(hub: Hub): HarnessHub {
  const boot = HARNESS_BOOT.parse({
    type: 'harness_boot',
    protocol: 1,
    device_id: randomUUID(),
    generation: randomUUID(),
    runtime_instance: randomUUID(),
    name: 'Test machine',
    hub_url: 'http://hub.test',
    token: 'token',
    home_directory: '/home/test',
    state_directory: '/home/test/state',
    platform: 'linux',
    permission: { sandbox: 'danger-full-access', approval: 'never' },
  });
  return new HarnessHub(boot, hub);
}

let fixture: DispatcherFixture | undefined;
afterEach(async () => {
  await fixture?.dispose();
  fixture = undefined;
});

async function booted(hub: Hub): Promise<DispatcherFixture> {
  fixture = await bootDispatcher(undefined, (ctx, persistence) =>
    new CentralHarnessTools(http(hub), persistence).install(ctx),
  );
  return fixture;
}

function texts(request: GenerateOptions, role: 'system' | 'user' | 'tool'): readonly string[] {
  return request.messages
    .filter((message) => message.role === role)
    .flatMap((message) =>
      message.content.flatMap((part) => (part.type === 'text' ? [part.text] : [])),
    );
}

describe('a hub tool called from a computer', () => {
  it('reaches the hub with only the writer claim, the tool name and its arguments', async () => {
    const hub = new Hub();
    const host = await booted(hub);
    host.model.script(
      { kind: 'tool', id: 'call-1', name: 'ping', input: { text: 'héllo "quoted" 1.0' } },
      { kind: 'text', text: 'done' },
    );
    const opened = await host.open();

    await host.send(opened, 'ping the hub');
    await host.finished(1);

    const call = hub.requests.find((request) => request.operation === 'tool');
    expect(call).toStrictEqual({
      operation: 'tool',
      claim: opened.claim,
      name: 'ping',
      arguments: { text: 'héllo "quoted" 1.0' },
    });
    expect(texts(host.model.requests[1] ?? failMissing(), 'tool').join('\n')).toContain('echoed');
  });

  it('keeps the system prompt identical on every step and puts the turn facts in the user turn', async () => {
    const hub = new Hub();
    const host = await booted(hub);
    host.model.script(
      { kind: 'tool', id: 'call-1', name: 'ping', input: { text: 'a' } },
      { kind: 'text', text: 'done' },
    );
    const opened = await host.open();

    await host.send(opened, 'ping the hub');
    await host.finished(1);

    const [first, second] = host.model.requests;
    expect(texts(first ?? failMissing(), 'system').join('\n')).toContain('You are the home AI.');
    expect(texts(second ?? failMissing(), 'system')).toStrictEqual(
      texts(first ?? failMissing(), 'system'),
    );
    expect(texts(first ?? failMissing(), 'system').join('\n')).not.toContain('Local time');
    expect(texts(first ?? failMissing(), 'user').join('\n')).toContain('Local time: Saturday 09:0');
    expect(texts(second ?? failMissing(), 'user').join('\n')).toMatch(
      /Local time: Saturday 09:0[1-9]/u,
    );
  });

  it('asks the hub for the conversation context once per model step, compaction included', async () => {
    const hub = new Hub();
    const host = await booted(hub);
    host.model.script(
      { kind: 'tool', id: 'call-1', name: 'ping', input: { text: 'a' } },
      { kind: 'text', text: 'done' },
    );
    const opened = await host.open();

    await host.send(opened, 'ping the hub');
    await host.finished(1);

    const contexts = hub.requests.filter((request) => request.operation === 'context');
    expect(contexts).toHaveLength(host.model.requests.length);
  });
});

function failMissing(): never {
  throw new Error('The model was not called.');
}
