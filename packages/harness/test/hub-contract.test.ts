import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { AiHarnessEvent } from '@smarteverything/domain';
import { bootDispatcher } from './support/dispatcher';
import type { DispatcherFixture } from './support/dispatcher';

let fixture: DispatcherFixture | undefined;
afterEach(async () => {
  await fixture?.dispose();
  fixture = undefined;
});

async function booted(): Promise<DispatcherFixture> {
  fixture = await bootDispatcher();
  return fixture;
}

function kinds(events: readonly AiHarnessEvent[]): readonly string[] {
  return events.map((event) => event.kind);
}

function states(events: readonly AiHarnessEvent[]): readonly string[] {
  return events.flatMap((event) => (event.kind === 'state' ? [event.session.state] : []));
}

function replyText(events: readonly AiHarnessEvent[]): string {
  return events.map((event) => (event.kind === 'text' ? event.delta : '')).join('');
}

describe('what the hub sees of a turn', () => {
  it('acknowledges the prompt at once and then streams the reply, usage and completion', async () => {
    const host = await booted();
    host.model.script({ kind: 'text', text: 'Hello there' });
    const opened = await host.open();

    const receipt = await host.send(opened, 'hi');
    await host.finished(1);

    expect(receipt).toMatchObject({ state: 'accepted', epoch: opened.claim.epoch });
    expect(replyText(host.published)).toBe('Hello there');
    expect(kinds(host.published).filter((kind) => kind === 'usage')).toHaveLength(1);
    expect(host.published.find((event) => event.kind === 'completed')).toMatchObject({
      interrupted: false,
    });
  });

  it('moves the session from idle to working and back to idle', async () => {
    const host = await booted();
    host.model.script({ kind: 'text', text: 'ok' });
    const opened = await host.open();

    await host.send(opened, 'hi');
    await host.finished(1);

    const seen = states(host.published);
    expect(seen[0]).toBe('idle');
    expect(seen).toContain('working');
    expect(seen.at(-1)).toBe('idle');
  });

  it('tags every event with the session, chat, epoch and a rising sequence number', async () => {
    const host = await booted();
    host.model.script({ kind: 'text', text: 'ok' });
    const opened = await host.open();

    await host.send(opened, 'hi');
    await host.finished(1);

    for (const event of host.published) {
      expect(event).toMatchObject({
        session_id: opened.sessionId,
        chat_id: opened.chatId,
        epoch: opened.claim.epoch,
      });
    }
    const sequence = host.published.map((event) => event.seq);
    expect(sequence).toStrictEqual([...sequence].sort((a, b) => a - b));
    expect(new Set(sequence).size).toBe(sequence.length);
  });

  it('ties the streamed reply to the delivery that asked for it', async () => {
    const host = await booted();
    host.model.script({ kind: 'text', text: 'ok' });
    const opened = await host.open();
    const delivery = randomUUID();

    await host.dispatcher.execute(randomUUID(), {
      kind: 'prompt',
      session_id: opened.sessionId,
      expected_epoch: opened.claim.epoch,
      delivery_id: delivery,
      text: 'hi',
      attachments: [],
    });
    await host.finished(1);

    const text = host.published.find((event) => event.kind === 'text');
    expect(text?.delivery_id).toBe(delivery);
  });

  it('reports a tool the model runs as running and then completed, with its input and output', async () => {
    const host = await booted();
    const file = join(host.directory, 'home', 'note.txt');
    host.model.script(
      { kind: 'tool', id: 'call-1', name: 'write', input: { file_path: file, content: 'hello' } },
      { kind: 'text', text: 'Saved' },
    );
    const opened = await host.open();

    await host.send(opened, 'save a note');
    await host.finished(1);

    const tools = host.published.filter((event) => event.kind === 'tool');
    expect(tools.map((event) => event.state)).toStrictEqual(['running', 'completed']);
    expect(tools[0]).toMatchObject({ call_id: 'call-1', name: 'write' });
    expect(tools.at(-1)?.output).toContain(file);
  });

  it('completes as interrupted when the hub interrupts a running turn', async () => {
    const host = await booted();
    host.model.script({ kind: 'hang' });
    const opened = await host.open();
    await host.send(opened, 'think forever');
    await vi.waitFor(() => {
      expect(host.model.requests).toHaveLength(1);
    });

    const receipt = await host.control(opened, 'interrupt');
    await host.finished(1);

    expect(receipt.state).toBe('completed');
    expect(host.published.find((event) => event.kind === 'completed')).toMatchObject({
      interrupted: true,
    });
  });

  it('refuses a control that names another writer epoch', async () => {
    const host = await booted();
    const opened = await host.open();

    await expect(
      host.control(
        { ...opened, claim: { ...opened.claim, epoch: opened.claim.epoch + 1 } },
        'interrupt',
      ),
    ).rejects.toThrow(/another native writer epoch/u);
  });
});

describe('what the hub sees when a chat moves away', () => {
  it('confirms the close after the running turn finishes and the session is flushed', async () => {
    const host = await booted();
    host.model.script({ kind: 'text', text: 'ok' });
    const opened = await host.open();
    await host.send(opened, 'hi');

    const receipt = await host.control(opened, 'close');

    expect(receipt.state).toBe('closed');
    expect(replyText(host.published)).toBe('ok');
    expect(host.dispatcher.hasSession(opened.sessionId, opened.claim.epoch)).toBe(false);
  });

  it('answers a repeated close of a session it no longer holds', async () => {
    const host = await booted();
    const opened = await host.open();
    await host.control(opened, 'close');

    const again = await host.control(opened, 'close');

    expect(again.state).toBe('closed');
  });

  it('refuses new prompts for a session that has been closed', async () => {
    const host = await booted();
    const opened = await host.open();
    await host.control(opened, 'close');

    await expect(host.send(opened, 'too late')).rejects.toThrow(/claim|not active/u);
  });

  it('replaces a session it holds from an older attachment when the hub attaches it again', async () => {
    const host = await booted();
    const opened = await host.open();
    const next = await host.reattach(opened);

    expect(host.dispatcher.hasSession(opened.sessionId, opened.claim.epoch)).toBe(false);
    expect(host.dispatcher.hasSession(opened.sessionId, next.claim.epoch)).toBe(true);
  });

  it('knows which session and epoch it currently holds', async () => {
    const host = await booted();
    const opened = await host.open();

    expect(host.dispatcher.hasSession(opened.sessionId, opened.claim.epoch)).toBe(true);
    expect(host.dispatcher.hasSession(opened.sessionId, opened.claim.epoch + 1)).toBe(false);
    expect(host.dispatcher.hasSession(randomUUID(), 1)).toBe(false);
  });
});

describe('the Access mode the hub sets', () => {
  it('applies a new mode to the running session and reports it back', async () => {
    const host = await booted();
    const opened = await host.open({ sandbox: 'read-only', approval: 'on-request' });
    const operation = randomUUID();

    await host.dispatcher.execute(operation, {
      kind: 'permission',
      session_id: opened.sessionId,
      expected_epoch: opened.claim.epoch,
      operation_id: operation,
      permission: { sandbox: 'danger-full-access', approval: 'never' },
    });

    const reported = host.published.filter((event) => event.kind === 'state').at(-1);
    expect(reported?.session.permission).toStrictEqual({
      sandbox: 'danger-full-access',
      approval: 'never',
    });
  });
});
