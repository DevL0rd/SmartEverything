import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { HARNESS_NATIVE_FRAME, NO_PRICES } from '@smarteverything/domain';
import type { AiModelRow, DshSessionEvent, JsonValue } from '@smarteverything/domain';
import type { AuxCompletionInput } from '../../../src/assistant/side-completion';
import { TitleService } from '../../../src/assistant/titles/title-service';
import type { StoredEvent } from '../../../src/store/repositories/assistant-events';
import { testLogger } from '../../support/logs';
import { useRig, type Rig } from './support/rig';

let rig: Rig;
useRig((made) => {
  rig = made;
});

const MOMENT = '2026-10-01T00:00:00.000Z';

const FLASH_LITE: AiModelRow = {
  id: 'google/gemini-3.5-flash-lite',
  provider: 'openrouter',
  name: 'Flash Lite',
  author: 'google',
  author_name: 'Google',
  family: 'gemini',
  description: '',
  created: MOMENT,
  context_length: 1_000_000,
  max_output: 8192,
  input_modalities: ['text'],
  output_modalities: ['text'],
  supported_parameters: [],
  reasoning: 'none',
  efforts: [],
  default_effort: null,
  tools: true,
  alias_of: null,
  pricing: NO_PRICES,
  kinds: ['chat'],
  expires_at: null,
  synced_at: MOMENT,
  gone_at: null,
};

interface Rigged {
  readonly titles: TitleService;
  readonly requests: AuxCompletionInput[];
}

function titleService(reply: string): Rigged {
  const requests: AuxCompletionInput[] = [];
  const titles = new TitleService({
    store: rig.opened.store,
    now: (): Date => new Date(MOMENT),
    log: testLogger('assistant'),
    completions: {
      complete: (input): Promise<string> => {
        requests.push(input);
        return Promise.resolve(reply);
      },
    },
    catalogue: {
      rows: (): AiModelRow[] => [FLASH_LITE],
      onChange: (): (() => void) => (): void => undefined,
    },
  });
  return { titles, requests };
}

async function openDshChat(): Promise<{
  readonly chatId: string;
  readonly log: (events: readonly DshSessionEvent[]) => void;
}> {
  const chat = rig.opened.store.aiChats.create({
    profileId: rig.owner.profileId,
    kind: 'chat',
    title: 'New chat',
    icon: null,
    parentId: null,
    sourceKey: null,
    titleAuto: true,
    engine: {
      kind: 'dsh',
      execution_target: rig.hub.target,
      session_id: null,
      model_route_id: rig.route.route_id,
      model: rig.route.model,
      effort: rig.route.effort,
      permission: { sandbox: 'danger-full-access', approval: 'never' },
    },
  });
  const request = rig.service.prepare(rig.owner, chat.id, rig.authority, rig.clientId);
  await rig.service.directory.execute(rig.hub.target, randomUUID(), request);
  const principal = rig.service.hostPrincipal(
    rig.owner.profileId,
    rig.service.directory.get(rig.hub.target).host,
  );
  rig.service.native(
    HARNESS_NATIVE_FRAME.parse({
      session_id: request.claim.session_id,
      epoch: request.claim.epoch,
      kind: 'open',
    }),
  );
  return {
    chatId: chat.id,
    log: (events): void => {
      const stat = rig.opened.store.dshSessions.stat(request.claim.session_id, rig.owner.profileId);
      const appended = rig.opened.store.dshSessions.append(
        {
          claim: request.claim,
          operation_id: randomUUID(),
          events: events.map((event, index) => ({ ...event, seq: (stat?.next_seq ?? 0) + index })),
        },
        principal,
      );
      rig.opened.store.dshSessions.flush(
        { claim: request.claim, expected_next_seq: appended.next_seq },
        principal,
      );
    },
  };
}

function titleEvent(
  source: Record<string, JsonValue>,
  title: string,
  extra: Record<string, JsonValue> = {},
): DshSessionEvent {
  return {
    type: 'session/title',
    seq: 0,
    time: 1,
    data: { title, messageSeqs: [], source, ...extra },
  };
}

function reply(chatId: string): StoredEvent {
  const chat = rig.opened.store.aiChats.chat(chatId);
  return {
    cursor: 1,
    id: randomUUID(),
    kind: 'chat',
    chat_id: chatId,
    message_id: null,
    profile_id: chat.profile_id,
    client_id: null,
    text: 'Turn on the garden lights at dusk',
    report_to: null,
    hops: 0,
    received_at: MOMENT,
    delivered_at: MOMENT,
    answered_at: MOMENT,
  };
}

async function settled(): Promise<void> {
  for (let round = 0; round < 10; round += 1) await Promise.resolve();
}

describe('the title service', () => {
  it('names a dsh chat from the title the session logged for its first prompt', async () => {
    titleService('unused');
    const opened = await openDshChat();

    opened.log([
      titleEvent(
        { kind: 'provider', provider: 'session-title-first-prompt-llm' },
        '"Garden lights 🌙."',
      ),
    ]);

    const chat = rig.opened.store.aiChats.chat(opened.chatId);
    expect(chat.title).toBe('Garden lights');
    expect(rig.opened.store.aiChats.titleAuto(opened.chatId)).toBe(false);
  });

  it('keeps the default title for the first-words fallback, a person rename and replayed history', async () => {
    titleService('unused');
    const opened = await openDshChat();

    opened.log([
      titleEvent({ kind: 'fallback' }, 'Turn on the garden'),
      titleEvent({ kind: 'user' }, 'Renamed in the log'),
      titleEvent({ kind: 'provider', provider: 'p' }, 'Copied title', { historyReplay: true }),
    ]);

    expect(rig.opened.store.aiChats.chat(opened.chatId).title).toBe('New chat');
    expect(rig.opened.store.aiChats.titleAuto(opened.chatId)).toBe(true);
  });

  it('never renames a dsh chat the person named', async () => {
    titleService('unused');
    const opened = await openDshChat();
    rig.opened.store.aiChats.update(opened.chatId, { title: 'Holiday' });

    opened.log([titleEvent({ kind: 'provider', provider: 'p' }, 'Garden lights')]);

    expect(rig.opened.store.aiChats.chat(opened.chatId).title).toBe('Holiday');
  });

  it('asks the small model to title a native helper and never a dsh chat', async () => {
    const { titles, requests } = titleService('Garden lights');
    const opened = await openDshChat();
    const claude = rig.opened.store.aiChats.create({
      profileId: rig.owner.profileId,
      kind: 'subagent',
      title: 'New chat',
      icon: null,
      parentId: opened.chatId,
      sourceKey: null,
      titleAuto: true,
      engine: {
        kind: 'claude',
        device_id: randomUUID(),
        model: 'opus',
        effort: null,
        settings: { builtin_tools: [] },
      },
    });

    titles.afterReply(reply(opened.chatId), 'Done.', true);
    titles.afterReply(reply(claude.id), 'Done.', true);
    await settled();

    expect(requests.map((request) => request.chatId)).toEqual([claude.id]);
    expect(rig.opened.store.aiChats.chat(claude.id).title).toBe('Garden lights');
  });
});
