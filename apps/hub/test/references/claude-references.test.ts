import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  COMPUTER_AI_READ,
  type AiChatRow,
  type AiMessageReference,
  type AiReference,
  type ComputerAiRead,
} from '@smarteverything/domain';
import type { ComputerAiDirectory } from '../../src/computers/ai-directory';
import { ProjectFilesService } from '../../src/projects/service';
import { claudeReferences } from '../../src/references/claude';
import { ReferenceService } from '../../src/references/service';
import type { Caller } from '../../src/server/auth';
import { testStore, type TestStore } from '../support/store';

const FOLDER = '/work/project';
let opened: TestStore;
let profileId: string;
let clientId: string;
const device = '3c1d5a52-9a0e-4b0d-8f0b-7f2b1f6d4e90';
let asked: ComputerAiRead[];
let references: ReferenceService;
let chat: AiChatRow;

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- partial fake of a large collaborator
function loose<T>(value: object): T {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- partial fake of a large collaborator
  return Object.assign(Object.create(null), value);
}

function directory(cwd: string | undefined): Pick<ComputerAiDirectory, 'status' | 'request'> {
  return loose({
    status: () => ({
      settings: {
        provider: {
          options: cwd === undefined ? { builtin_tools: [] } : { builtin_tools: [], cwd },
        },
      },
    }),
    request: (_device: string, request: unknown): Promise<unknown> => {
      asked.push(COMPUTER_AI_READ.parse(request));
      return Promise.resolve({
        entries: [
          { path: 'src/app.ts', entry_kind: 'file', version: '1-2' },
          { path: 'src/my notes.md', entry_kind: 'file', version: '3-4' },
        ],
        incomplete: false,
      });
    },
  });
}

function claudeChat(settings: Record<string, unknown>): AiChatRow {
  return opened.store.aiChats.create({
    profileId,
    kind: 'chat',
    title: 'Claude',
    icon: null,
    parentId: null,
    sourceKey: null,
    engine: {
      kind: 'claude',
      device_id: device,
      model: 'sonnet',
      effort: null,
      settings: { builtin_tools: [], ...settings },
    },
  });
}

function callerOf(target: AiChatRow): Caller {
  return { kind: 'client', client: opened.store.clients.byId(clientId), chatId: target.id };
}

function mention(reference: AiReference, token: string): AiMessageReference {
  return { reference, label: token.slice(1), token, start: 0, end: token.length };
}

beforeEach(async () => {
  opened = await testStore(() => new Date());
  const owner = opened.store.clients.create(
    { name: 'Pixel', platform: 'android', role: 'owner', tokenHash: 'a'.repeat(64) },
    true,
  );
  clientId = owner.id;
  profileId = opened.store.profiles.activeOf(owner.id).id;
  asked = [];
  references = new ReferenceService(opened.store, new ProjectFilesService(opened.directory));
  references.attachNative(['claude'], claudeReferences(directory(undefined)));
  chat = claudeChat({ cwd: FOLDER });
});

afterEach(async () => {
  await opened.close();
});

describe('mentioning files in a Claude chat', () => {
  it('searches only the chat folder on its computer, once, and never other kinds', async () => {
    const result = await references.search(callerOf(chat), chat.id, { query: 'app', limit: 20 });
    expect(asked).toEqual([{ operation: 'provider_files', cwd: FOLDER, query: 'app', limit: 20 }]);
    expect(result.items.map((item) => item.label)).toEqual(['src/app.ts']);
    expect(result.items[0]?.reference).toMatchObject({
      kind: 'device_path',
      workspace_root: FOLDER,
      path: 'src/app.ts',
      target: { kind: 'device', device_id: device },
    });
    expect(result.sources).toEqual([{ kind: 'device_path', state: 'available' }]);
  });

  it('uses the computer folder when the chat has none of its own', async () => {
    const bare = claudeChat({});
    references.attachNative(['claude'], claudeReferences(directory('/home/me/repo')));
    await references.search(callerOf(bare), bare.id, { query: '', limit: 5 });
    expect(asked[0]).toMatchObject({ cwd: '/home/me/repo' });
  });

  it('says a folder is needed when the chat has no working directory', async () => {
    const bare = claudeChat({});
    const result = await references.search(callerOf(bare), bare.id, { query: '', limit: 5 });
    expect(asked).toEqual([]);
    expect(result.items).toEqual([]);
    expect(result.sources[0]).toMatchObject({ kind: 'device_path', state: 'unavailable' });
  });

  it('accepts a mention of a file in the chat folder and rejects other places and kinds', async () => {
    const inside: AiReference = {
      kind: 'device_path',
      target: { kind: 'device', device_id: device },
      workspace_root: FOLDER,
      path: 'src/app.ts',
      entry_kind: 'file',
      version: '1-2',
    };
    const text = '@src/app.ts';
    await expect(
      references.resolve(callerOf(chat), chat.id, text, [mention(inside, text)]),
    ).resolves.toHaveLength(1);
    const elsewhere = { ...inside, workspace_root: '/etc' };
    await expect(
      references.resolve(callerOf(chat), chat.id, text, [mention(elsewhere, text)]),
    ).rejects.toThrow(/folder this chat works in/u);
    const project: AiReference = {
      kind: 'managed_path',
      chat_id: chat.id,
      path: 'workspace/a.md',
      entry_kind: 'file',
      version: 'v',
    };
    await expect(
      references.resolve(callerOf(chat), chat.id, '@a.md', [mention(project, '@a.md')]),
    ).rejects.toThrow();
  });

  it('does not ask the computer again when only unsupported kinds are requested', async () => {
    const result = await references.search(callerOf(chat), chat.id, {
      query: '',
      limit: 5,
      kinds: ['skill', 'chat'],
    });
    expect(asked).toEqual([]);
    expect(result.items).toEqual([]);
  });
});
