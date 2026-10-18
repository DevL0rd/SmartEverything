import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Context } from '@deepseek-ai/cordis';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { SessionId } from '@deepseek-ai/dsh-session';
import { bootDispatcher } from './support/dispatcher';
import type { DispatcherFixture } from './support/dispatcher';

const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

let fixture: DispatcherFixture | undefined;
afterEach(async () => {
  await fixture?.dispose();
  fixture = undefined;
});

async function withOlderImage(): Promise<{
  readonly host: DispatcherFixture;
  readonly described: number[];
  readonly reads: number[];
}> {
  let active: Context | undefined;
  const described: number[] = [];
  const host = await bootDispatcher(
    undefined,
    async (ctx) => {
      await ctx.inject(['attachments', 'sessions'], (ready) => {
        active = ready;
      });
    },
    {
      describeImage: (input) => {
        described.push(input.seq);
        return Promise.resolve('a photo of a cat');
      },
    },
  );
  fixture = host;
  const read = vi.spyOn(host.persistence, 'read');
  const opened = await host.open();
  const ready = active;
  const session = ready?.sessions.get(SessionId(opened.sessionId));
  if (ready === undefined || session === undefined) throw new Error('The session is not open.');
  const attach = async (): Promise<void> => {
    const content = await ready.attachments.admitPromptContent([
      { type: 'image', mediaType: 'image/png', data: PNG },
    ]);
    session.append('user/message', createUserMessage({ content, source: { kind: 'user' } }), {
      surfaceOp: 'append',
    });
  };
  host.model.script({ kind: 'text', text: 'one' }, { kind: 'text', text: 'two' });
  await attach();
  await host.send(opened, 'first');
  await host.finished(1);
  await attach();
  await host.send(opened, 'second');
  await host.finished(2);
  return { host, described, reads: read.mock.calls.map(([, range]) => range?.offset ?? 0) };
}

describe('older images in a conversation', () => {
  it('are replaced by their description once each, before the model sees them', async () => {
    const { host, described } = await withOlderImage();

    expect(described).toHaveLength(2);
    const seen = host.model.requests.flatMap((request) =>
      request.messages.flatMap((message) => message.content.map((part) => part.type)),
    );
    expect(seen).not.toContain('image');
  });

  it('are found by reading only the events written since the last step', async () => {
    const { reads } = await withOlderImage();

    const scans = reads.slice(-2);
    expect(scans[0]).toBe(0);
    expect(scans[1]).toBeGreaterThan(0);
  });
});
