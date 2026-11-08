import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DSH_SESSION_HEADER,
  IMAGE_OPERATION_RECEIPT,
  helperDialogueOf,
  type AiChatRow,
  type AssistantHelperPost,
  type AssistantMessageRow,
  type Engine,
} from '@smarteverything/domain';
import { ChatDirectory } from '../../src/assistant/chat-directory';
import { ConversationLog } from '../../src/assistant/conversation-log';
import { postHelperArtifacts } from '../../src/assistant/delegation/helper-artifact-post';
import { withProviderToolAuthority } from '../../src/assistant/engines/computer/tool-authority';
import { AssistantFiles } from '../../src/assistant/files';
import { eventAuthority, withExecutionAuthority } from '../../src/assistant/turn-authority';
import type { Caller } from '../../src/server/auth';
import { withSignal } from '../../src/server/request-signal';
import { summaryOf, type StoredAttachment } from '../../src/store/repositories/assistant-files';
import { CLAUDE_TEST_ENGINE, TEST_ENGINE } from '../support/engine';
import { testStore, type TestStore } from '../support/store';
import { harnessRig } from './harness/support/rig';
import { hubLayout } from '../../src/data-layout';

const NOW = '2026-11-05T15:00:00.000Z';
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=',
  'base64',
);
type ClientCaller = Extract<Caller, { kind: 'client' }>;

let opened: TestStore;
let client: ClientCaller['client'];
let profile: string;
let files: AssistantFiles;
let chats: ChatDirectory;
let log: ConversationLog;
let parent: AiChatRow;

beforeEach(async () => {
  const now = (): Date => new Date(NOW);
  opened = await testStore(now);
  const { store } = opened;
  client = store.clients.create(
    { name: 'Desktop', platform: 'desktop', role: 'owner', tokenHash: 'fixture' },
    true,
  );
  profile = store.profiles.activeOf(client.id).id;
  files = new AssistantFiles({
    layout: hubLayout(opened.directory, {}),
    chat: store.assistantChat,
    now,
  });
  log = new ConversationLog(store);
  chats = new ChatDirectory(store, files);
  parent = chats.create(
    { profileId: profile, role: 'owner' },
    { title: 'House', engine: TEST_ENGINE },
  );
});
afterEach(async () => opened.close());

function helper(engine: Engine = CLAUDE_TEST_ENGINE): AiChatRow {
  return chats.create(
    { profileId: profile, role: 'owner' },
    { title: 'File worker', engine, parent_id: parent.id },
  );
}

function callerOf(chat: AiChatRow): ClientCaller {
  const { store } = opened;
  const event = store.assistantEvents.add({
    id: randomUUID(),
    chat_id: chat.id,
    profile_id: chat.profile_id,
    client_id: client.id,
    message_id: null,
    text: 'Share these privately.',
    kind: 'chat',
  });
  store.assistantEvents.mark(event.id, 'delivered_at');
  return {
    kind: 'client',
    client,
    via: 'assistant',
    chatId: chat.id,
    authority: eventAuthority(store, event),
  };
}

function post(
  caller: ClientCaller,
  input: AssistantHelperPost,
  validate: () => void = () => undefined,
): Promise<AssistantMessageRow> {
  return withProviderToolAuthority({ validate, hubOsBan: false }, () =>
    withExecutionAuthority(caller.authority, () =>
      postHelperArtifacts({ store: opened.store, files }, caller, input),
    ),
  );
}

function save(name: string, content: Buffer, mime: string): Promise<StoredAttachment> {
  return files.keepBytes({
    profileId: profile,
    authorize: () => undefined,
    name,
    content,
    mime,
    signal: new AbortController().signal,
  });
}

function keep(chat: AiChatRow, attachments: readonly StoredAttachment[]): AssistantMessageRow {
  return log.responderInChat({ chat, replyTo: null, text: '', files: attachments });
}

function selected(...attachments: readonly StoredAttachment[]): AssistantHelperPost {
  return {
    requestId: randomUUID(),
    text: '',
    source: { kind: 'attachments', attachmentIds: attachments.map((file) => file.id) },
  };
}

function oneFile(row: AssistantMessageRow): StoredAttachment {
  const first = row.attachments[0];
  if (first === undefined) throw new Error('Expected the post to contain an attachment.');
  return opened.store.assistantChat.attachment(first.id);
}

function savedImageReceipt(
  chat: AiChatRow,
  row: AssistantMessageRow,
  file: StoredAttachment,
): string {
  const { imageOperations } = opened.store;
  const id = randomUUID();
  const reserved = imageOperations.reserve(
    'fixture',
    IMAGE_OPERATION_RECEIPT.parse({
      id,
      profile_id: profile,
      chat_id: chat.id,
      request: {
        operation_id: id,
        chat_id: chat.id,
        prompt: 'One result out of two',
        model: 'fixture',
        mode: 'generate',
        options: { n: 2 },
      },
      endpoint: {
        model: 'fixture',
        name: 'Fixture',
        provider_tag: 'fixture',
        parameters: {},
        supports_streaming: false,
        pricing: [],
      },
      inputs: [],
      state: 'reserved',
      progress: 0,
      results: [],
      message_id: null,
      created_at: NOW,
      updated_at: NOW,
      reason: null,
      usage: null,
    }),
  );
  imageOperations.update({
    ...reserved,
    state: 'completed',
    message_id: row.id,
    results: [{ operation_id: id, attachment: summaryOf(file), parents: [], sha256: file.sha256 }],
  });
  return id;
}

describe('explicit helper artifact sharing', () => {
  it.each(['claude', 'codex'] as const)(
    'copies files independently through a current %s grant',
    async (kind) => {
      const child = helper(
        kind === 'claude' ? CLAUDE_TEST_ENGINE : { ...CLAUDE_TEST_ENGINE, kind, settings: {} },
      );
      const original = await save('result.txt', Buffer.from('private result'), 'text/plain');
      const source = keep(child, [original]);
      const caller = callerOf(child);
      const input = selected(original);

      const row = await post(caller, input);
      const copy = oneFile(row);
      expect(row).toMatchObject({ chat_id: parent.id, text: '', author: child.helper_name });
      expect(helperDialogueOf(row)).toMatchObject({
        direction: 'from_helper',
        helper_chat_id: child.id,
      });
      expect(copy).toMatchObject({ message_id: row.id, sha256: original.sha256 });
      expect(copy.id).not.toBe(original.id);
      expect(copy.storage_path).not.toBe(original.storage_path);
      expect(opened.store.assistantChat.messageIdsOf(child.id)).toEqual([source.id]);
      expect(opened.store.assistantEvents.pendingSubagentRoots()).toEqual([]);

      await files.remove(opened.store.assistantChat.removeMessages([source.id]));
      expect(await readFile(files.pathOf(copy), 'utf8')).toBe('private result');
      expect((await post(caller, input)).id).toBe(row.id);
      await files.remove(opened.store.assistantChat.removeMessages([row.id]));
      await expect(post(caller, input)).rejects.toThrow('accepted and has been removed');
    },
  );

  it('copies exactly the retained results of a completed image operation', async () => {
    const child = helper();
    const image = await save('image.png', PNG, 'image/png');
    const unrelated = await save('other.png', PNG, 'image/png');
    const row = keep(child, [image]);
    keep(child, [unrelated]);
    const operationId = savedImageReceipt(child, row, image);
    const result = await post(callerOf(child), {
      requestId: randomUUID(),
      text: 'The generated image',
      source: { kind: 'image_operation', operationId },
    });
    const copy = oneFile(result);
    expect(result.attachments).toHaveLength(1);
    expect(copy).toMatchObject({
      mime: 'image/png',
      name: 'image.png',
      width: image.width,
      height: image.height,
    });
    expect(await readFile(files.pathOf(copy))).toEqual(PNG);
    await files.remove(opened.store.assistantChat.removeMessages([result.id]));
    expect(await readFile(files.pathOf(image))).toEqual(PNG);
  });

  it('rejects siblings, unbound uploads, duplicated IDs and direct app impersonation', async () => {
    const child = helper();
    const own = await save('mine.txt', Buffer.from('mine'), 'text/plain');
    const sibling = await save('sibling.txt', Buffer.from('sibling'), 'text/plain');
    const unbound = await save('upload.txt', Buffer.from('upload'), 'text/plain');
    keep(child, [own]);
    keep(helper(), [sibling]);
    const caller = callerOf(child);
    for (const file of [sibling, unbound])
      await expect(post(caller, selected(file))).rejects.toThrow('not saved in this helper chat');
    await expect(post(caller, selected(own, own))).rejects.toThrow('only once');
    await expect(
      postHelperArtifacts(
        { store: opened.store, files },
        { kind: 'client', client },
        selected(own),
      ),
    ).rejects.toThrow('admitted helper chat');
    expect(opened.store.assistantChat.messageIdsOf(parent.id)).toEqual([]);
  });

  it('keeps one receipt and refuses changed payloads on racing retries', async () => {
    const child = helper();
    const original = await save('result.txt', Buffer.from('content'), 'text/plain');
    keep(child, [original]);
    const caller = callerOf(child);
    const input = selected(original);
    const [first, second] = await Promise.all([post(caller, input), post(caller, input)]);
    expect(first.id).toBe(second.id);
    expect(opened.store.assistantChat.messageIdsOf(parent.id)).toEqual([first.id]);
    await expect(post(caller, { ...input, text: 'Changed' })).rejects.toThrow('already belongs');
    expect(opened.store.assistantChat.attachmentsOfChat(parent.id)).toHaveLength(1);
    expect(opened.store.assistantChat.unattachedBefore('2026-11-06T15:00:00.000Z')).toEqual([]);
  });

  it('discards staged copies if native admission changes before the commit', async () => {
    const child = helper();
    const original = await save('result.txt', Buffer.from('content'), 'text/plain');
    keep(child, [original]);
    const caller = callerOf(child);
    const stage = files.prepareCopy.bind(files);
    let current = true;
    vi.spyOn(files, 'prepareCopy').mockImplementationOnce(async (file) => {
      const copied = await stage(file);
      current = false;
      return copied;
    });
    const validate = (): void => {
      if (!current) throw new Error('native grant changed');
    };
    await expect(post(caller, selected(original), validate)).rejects.toThrow(
      'native grant changed',
    );
    expect(opened.store.assistantChat.messageIdsOf(parent.id)).toEqual([]);
    expect(opened.store.assistantChat.unattachedBefore('2026-11-06T15:00:00.000Z')).toEqual([]);
    expect(await readFile(files.pathOf(original), 'utf8')).toBe('content');
  });

  it('removes earlier staged copies if a later file fails', async () => {
    const child = helper();
    const first = await save('one.txt', Buffer.from('one'), 'text/plain');
    const second = await save('two.txt', Buffer.from('two'), 'text/plain');
    keep(child, [first, second]);
    const stage = files.prepareCopy.bind(files);
    vi.spyOn(files, 'prepareCopy')
      .mockImplementationOnce(stage)
      .mockRejectedValueOnce(new Error('second file could not be read'));
    await expect(post(callerOf(child), selected(first, second))).rejects.toThrow('second file');
    expect(opened.store.assistantChat.messageIdsOf(parent.id)).toEqual([]);
    expect(opened.store.assistantChat.unattachedBefore('2026-11-06T15:00:00.000Z')).toEqual([]);
    expect(await readFile(files.pathOf(first), 'utf8')).toBe('one');
  });
});

it('fences a DSH copy after transport abort and rejects a detached writer', async () => {
  const rig = await harnessRig();
  try {
    const { store } = rig.opened;
    const root = rig.newChat(rig.hub.target);
    const active = rig.service.prepare(rig.owner, root.id, rig.authority, rig.clientId);
    const principal = rig.service.hostPrincipal(
      rig.owner.profileId,
      rig.service.directory.get(rig.hub.target).host,
    );
    const session = rig.service.storage.adoptChild(
      DSH_SESSION_HEADER.parse({
        version: 4,
        id: randomUUID(),
        origin: 'subagent',
        parentSession: active.claim.session_id,
        delegationDepth: 1,
        createdAt: Date.now(),
        isSeeded: false,
        cwd: rig.opened.directory,
      }),
      0,
      principal,
      active.claim,
    );
    const child = store.aiChats.chat(session.metadata.chat_id);
    const eventId = store.harnessSessions.grant(session.claim.session_id)?.event_id;
    if (eventId === undefined || eventId === null)
      throw new Error('Expected the adopted DSH tool grant.');
    const authority = eventAuthority(store, store.assistantEvents.event(eventId));
    const dshFiles = new AssistantFiles({
      layout: hubLayout(rig.opened.directory, {}),
      chat: store.assistantChat,
      now: (): Date => new Date(),
    });
    const original = await dshFiles.keepBytes({
      authorize: () => undefined,
      profileId: child.profile_id,
      name: 'native.txt',
      mime: 'text/plain',
      content: Buffer.from('native'),
      signal: new AbortController().signal,
    });
    new ConversationLog(store).responderInChat({
      chat: child,
      replyTo: null,
      text: '',
      files: [original],
    });
    const caller: Caller = {
      kind: 'service',
      authority,
      chatId: child.id,
      profileId: child.profile_id,
    };
    const ports = { store, files: dshFiles };
    const input = selected(original);
    const connection = new AbortController();
    const prepareCopy = dshFiles.prepareCopy.bind(dshFiles);
    vi.spyOn(dshFiles, 'prepareCopy').mockImplementationOnce(async (file) => {
      const copy = await prepareCopy(file);
      connection.abort(new Error('the originating transport closed'));
      return copy;
    });
    await expect(
      withSignal(connection.signal, () => postHelperArtifacts(ports, caller, input)),
    ).rejects.toThrow('the originating transport closed');
    expect(store.dshSessions.attached(session.claim.session_id, child.profile_id)).not.toBeNull();
    expect(store.assistantChat.messageIdsOf(root.id)).toEqual([]);
    expect(await postHelperArtifacts(ports, caller, input)).toMatchObject({
      chat_id: root.id,
    });
    store.dshSessions.detach(session.claim.session_id, child.profile_id);
    await expect(postHelperArtifacts(ports, caller, selected(original))).rejects.toThrow(
      'no longer active',
    );
  } finally {
    await rig.close();
  }
});
