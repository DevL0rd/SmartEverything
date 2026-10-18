import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type {
  AiChatRow,
  AiNativeReferenceResult,
  HarnessRuntimeReceipt,
  HarnessRuntimeRequest,
} from '@smarteverything/domain';
import { harnessReferences } from '../../../src/harness/reference-runtime';
import { ProjectFilesService } from '../../../src/projects/service';
import { ReferenceService } from '../../../src/references/service';
import type { Caller } from '../../../src/server/auth';
import { acknowledge, harnessRig, type Rig } from './support/rig';

let rig: Rig;
let references: ReferenceService;
let projects: ProjectFilesService;
let chat: AiChatRow;
let caller: Caller;
let executed: HarnessRuntimeRequest[];

const NATIVE_PAGE = (device: string): AiNativeReferenceResult => ({
  items: [
    {
      reference: {
        kind: 'skill',
        name: 'garden-planner',
        provider: 'p',
        source: 's',
        identity: 'i',
        revision: 'r',
        resource_base: 'b',
      },
      label: 'garden-planner',
      subtitle: 'Skill',
    },
    {
      reference: {
        kind: 'device_path',
        target: { kind: 'device', device_id: device },
        workspace_root: '/home/test',
        path: 'garden.md',
        entry_kind: 'file',
        version: 'v1',
      },
      label: 'garden.md',
      subtitle: 'garden.md',
    },
  ],
  revision: 'native-1',
  next_cursor: null,
  incomplete: false,
});

beforeEach(async () => {
  rig = await harnessRig();
  executed = [];
  const connection = rig.service.directory.get(rig.desk.target);
  const manifest = connection.host.manifest;
  if (manifest === null || rig.desk.target.kind !== 'device')
    throw new Error('The test host has no manifest.');
  const device = rig.desk.target.device_id;
  rig.service.directory.register({
    actor: connection.actor,
    host: { ...connection.host, manifest: { ...manifest, references: { protocol: 1 } } },
    hasSession: () => true,
    execute: (_id, request): Promise<HarnessRuntimeReceipt> => {
      executed.push(request);
      if (request.kind !== 'reference') return Promise.resolve(acknowledge(request));
      return Promise.resolve({
        ...acknowledge(request),
        state: 'completed',
        references: NATIVE_PAGE(device),
      });
    },
  });
  projects = new ProjectFilesService(rig.opened.directory);
  references = new ReferenceService(rig.opened.store, projects);
  references.attachNative(['dsh', 'openrouter'], harnessReferences(rig.service));
  const created = rig.newChat(rig.desk.target);
  const open = rig.service.prepare(rig.owner, created.id, rig.authority, rig.clientId);
  await rig.service.directory.execute(rig.desk.target, randomUUID(), open);
  chat = rig.opened.store.aiChats.chat(created.id);
  caller = { kind: 'client', client: rig.opened.store.clients.byId(rig.clientId), chatId: chat.id };
  executed.length = 0;
});
afterEach(async () => {
  await rig.close();
});

describe('one search over skills, device files, chat folder files and chats', () => {
  it('returns every source with a single call to the machine', async () => {
    const folder = join(projects.root(chat.id), 'workspace');
    await mkdir(folder, { recursive: true });
    await writeFile(join(folder, 'garden-notes.txt'), 'x');
    rig.opened.store.aiChats.create({
      profileId: chat.profile_id,
      kind: 'chat',
      title: 'Garden budget',
      icon: null,
      parentId: null,
      sourceKey: null,
      engine: chat.engine,
    });

    const result = await references.search(caller, chat.id, { query: 'garden', limit: 20 });

    const kinds = new Set(result.items.map((item) => item.reference.kind));
    expect([...kinds].sort()).toStrictEqual(['chat', 'device_path', 'managed_path', 'skill']);
    expect(executed.filter((request) => request.kind === 'reference')).toHaveLength(1);
    const [call] = executed;
    expect(call).toMatchObject({
      kind: 'reference',
      input: {
        action: 'search',
        search: { kinds: ['device_path', 'skill', 'plugin', 'command', 'agent'] },
      },
    });
  });

  it('searches only the device when a device folder is being browsed', async () => {
    await references.search(caller, chat.id, {
      query: '',
      limit: 20,
      container: {
        kind: 'device_path',
        target:
          rig.desk.target.kind === 'device'
            ? rig.desk.target
            : { kind: 'device', device_id: randomUUID() },
        workspace_root: '/home/test',
        path: 'docs',
        entry_kind: 'directory',
        version: 'v1',
      },
    });

    expect(executed).toHaveLength(1);
    expect(executed[0]).toMatchObject({
      input: { action: 'search', search: { kinds: ['device_path'] } },
    });
  });
});
