import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  API_ENDPOINTS,
  ApiError,
  HARNESS_CENTRAL_CONTEXT,
  HARNESS_CENTRAL_RESULT,
  type AiChatRow,
  type ChatVoiceReceipt,
} from '@smarteverything/domain';
import type { HarnessTransportRequest } from '@smarteverything/domain';
import { ToolHub } from '../../../src/ai-tools/tool-hub';
import type { HubTool, HubToolResult, ToolSource } from '../../../src/ai-tools/hub-tool';
import { ChatVoiceReplies } from '../../../src/assistant-voice/chat-voice-replies';
import type { AssistantVoice } from '../../../src/assistant-voice/assistant-voice';
import { AssistantFiles } from '../../../src/assistant/files';
import { operationRunner, operationTool } from '../../../src/extensions/mcp/tools/operation-tools';
import { bindCentralHarness, centralTransport } from '../../../src/harness/central-transport';
import { HarnessHubTools } from '../../../src/harness/tools';
import { useRig, type Rig } from './support/rig';
import { hubLayout } from '../../../src/data-layout';

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
  readonly chat: AiChatRow;
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
    chat,
    claim: open.claim,
    send: (request) => centralTransport(rig.service, { ...binding, request }),
  };
}

describe('a hub tool called by a chat on another computer', () => {
  it('runs each call the writer makes, even when the same call is made again', async () => {
    const ran: string[] = [];
    installed(() => new Date(), ran);
    const { send, claim } = session();
    const call = {
      operation: 'tool',
      claim,
      event_id: null,
      call_id: 'call-1',
      name: 'ping',
      arguments: { text: 'a' },
    } as const;

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
        event_id: null,
        call_id: 'call-1',
        name: 'ping',
        arguments: { text: 'a' },
      }),
    ).rejects.toMatchObject({ code: 'ownership-lost' });
    expect(ran).toStrictEqual([]);
  });
});

const VOICE_TEXT = 'The greenhouse is ready.';
const VOICE_OPERATION = API_ENDPOINTS.postChatVoiceReply;

function voiceTurn({ chat, claim }: ReturnType<typeof session>): string {
  const { store } = rig.opened;
  const event = store.assistantEvents.add({
    id: randomUUID(),
    kind: 'chat',
    chat_id: chat.id,
    message_id: null,
    profile_id: chat.profile_id,
    client_id: rig.clientId,
    text: 'Send a voice reply',
  });
  store.assistantEvents.mark(event.id, 'delivered_at');
  store.harnessSessions.issue({
    ...rig.service.storage.grant(claim.session_id),
    event_id: event.id,
  });
  return event.id;
}

function voiceSession(
  beforeAudio: (current: ReturnType<typeof session>) => void = () => undefined,
): {
  readonly request: (eventId?: string) => Promise<unknown>;
  readonly record: ReturnType<typeof vi.fn<AssistantVoice['recordClip']>>;
  readonly budget: { readonly check: ReturnType<typeof vi.fn> };
  readonly current: ReturnType<typeof session>;
} {
  const { store, directory } = rig.opened;
  const current = session();
  const firstEvent = voiceTurn(current);
  const record = vi.fn<AssistantVoice['recordClip']>(async () => {
    beforeAudio(current);
    await Promise.resolve();
    return { wav: Buffer.from('fake audio'), model: 'gemini-3.8-flash-tts' };
  });
  const files = new AssistantFiles({
    chat: store.assistantChat,
    layout: hubLayout(directory, {}),
    now: (): Date => new Date(),
  });
  const budget = { check: vi.fn() };
  const replies = new ChatVoiceReplies({ store, files, voice: { recordClip: record }, budget });
  const tool = operationTool('chat_speak', 'postChatVoiceReply');
  const invoke = operationVoiceCall(replies);
  const hub = new ToolHub([
    {
      tools: (): HubTool[] => [{ ...tool.listing, origin: { kind: 'se' }, humanOnly: false }],
      call: invoke,
      validate: (): null => null,
      changes: (): (() => void) => (): void => undefined,
    },
  ]);
  bindCentralHarness(rig.service, new HarnessHubTools(rig.service, hub), () => new Date());
  const request = (eventId = firstEvent): Promise<unknown> =>
    current.send({
      operation: 'tool',
      claim: current.claim,
      event_id: eventId,
      call_id: 'voice-1',
      name: 'chat_speak',
      arguments: { text: VOICE_TEXT },
    });
  return { request, record, budget, current };
}

function operationVoiceCall(replies: ChatVoiceReplies): ToolSource['call'] {
  const invoke = operationRunner('chat_speak', 'postChatVoiceReply');
  return async (_tool, args, actor): Promise<HubToolResult> => {
    const output = await invoke(
      {
        store: rig.opened.store,
        caller: null,
        actor,
        operations: {
          run: (_name, caller, input): Promise<ChatVoiceReceipt> =>
            replies.post(caller, VOICE_OPERATION.body.parse(input.body)),
        },
      },
      args,
    );
    return { response: output.structured, line: '', pictures: [] };
  };
}

describe('a voice reply from a chat on another computer', () => {
  it('charges and posts once when a writer repeats the same call', async () => {
    const { current, request, record, budget } = voiceSession();
    const first = HARNESS_CENTRAL_RESULT.parse(await request());
    const receipt = VOICE_OPERATION.response.parse(first.response['result']);
    const second = HARNESS_CENTRAL_RESULT.parse(await request());

    expect(second).toEqual(first);
    expect(receipt.chatId).toBe(current.chat.id);
    expect(record).toHaveBeenCalledOnce();
    expect(budget.check).toHaveBeenCalledOnce();
    expect(rig.opened.store.assistantChat.message(receipt.messageId).attachments).toMatchObject([
      { id: receipt.attachmentId, transcript: VOICE_TEXT, mime: 'audio/wav' },
    ]);

    const nextEvent = voiceTurn(current);
    await expect(request()).rejects.toThrow('no longer belongs to the current turn');
    expect(record).toHaveBeenCalledOnce();
    expect(budget.check).toHaveBeenCalledOnce();

    const next = HARNESS_CENTRAL_RESULT.parse(await request(nextEvent));
    expect(VOICE_OPERATION.response.parse(next.response['result']).messageId).not.toBe(
      receipt.messageId,
    );
    expect(record).toHaveBeenCalledTimes(2);
  });

  it('cannot publish when the writer detaches during synthesis', async () => {
    const { request, record } = voiceSession(({ claim, chat }) => {
      rig.opened.store.dshSessions.detach(claim.session_id, chat.profile_id);
    });

    const result = HARNESS_CENTRAL_RESULT.parse(await request());

    expect(result.response['error']).toMatch(/session is not attached/u);
    const recording = record.mock.calls[0]?.[0];
    expect(recording).toBeDefined();
    expect(rig.opened.store.assistantChat.find(recording?.id ?? '')).toBeUndefined();
  });

  it('cannot publish when the current turn changes under the same writer', async () => {
    const { request, record } = voiceSession(voiceTurn);

    const result = HARNESS_CENTRAL_RESULT.parse(await request());

    expect(result.response['error']).toMatch(/no longer belongs to the current turn/u);
    const recording = record.mock.calls[0]?.[0];
    expect(recording).toBeDefined();
    expect(rig.opened.store.assistantChat.find(recording?.id ?? '')).toBeUndefined();
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
