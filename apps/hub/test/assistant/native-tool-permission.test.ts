import { randomUUID } from 'node:crypto';
import {
  DEFAULT_CODEX_AI_SETTINGS,
  type AiChatRow,
  type CodexProviderOptions,
} from '@smarteverything/domain';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { ProviderState } from '../../src/assistant/engines/computer/provider-state';
import { providerToolValidation } from '../../src/assistant/engines/computer/tool-validation';
import { ComputerAiDirectory } from '../../src/computers/ai-directory';
import { testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

const CWD = '/home/test/work';
const READ_ONLY = { type: 'readOnly', networkAccess: false } as const;
const FULL = { type: 'dangerFullAccess' } as const;
let opened: TestStore;
let directory: ComputerAiDirectory;

beforeEach(async () => {
  opened = await testStore();
  directory = new ComputerAiDirectory(opened.store, testLogger('computer'));
});

afterEach(async () => {
  directory.stop();
  await opened.close();
});

function computer(): string {
  const [row] = opened.store.devices.upsert([
    {
      provider: 'local',
      externalId: 'computer:test',
      parentId: null,
      kind: 'computer',
      name: 'Supplying computer',
      model: 'smarteverything.computer',
      manufacturer: 'Linux',
      providerRoom: null,
      roomId: null,
      online: true,
      capabilities: [],
      details: {},
    },
  ]);
  if (row === undefined) throw new Error('Expected a computer');
  return row.id;
}

function running(sandbox: NonNullable<CodexProviderOptions['sandbox_policy']>): {
  readonly store: TestStore['store'];
  readonly chat: AiChatRow;
  readonly engine: Extract<AiChatRow['engine'], { kind: 'codex' }>;
  readonly state: ProviderState;
  readonly validate: (write: boolean) => void;
} {
  const { store } = opened;
  const owner = store.clients.create(
    { name: 'Owner computer', platform: 'desktop', role: 'owner', tokenHash: 'test' },
    true,
  );
  const profileId = store.profiles.activeOf(owner.id).id;
  const target = { device_id: computer(), runtime: 'codex' } as const;
  const options = { cwd: CWD, approval_policy: 'on-request', sandbox_policy: sandbox } as const;
  store.computerRuntimes.saveSettings(target, {
    runtime: 'codex',
    settings: { ...DEFAULT_CODEX_AI_SETTINGS, provider: { enabled: true, options } },
  });
  const engine = {
    kind: 'codex',
    device_id: target.device_id,
    model: 'gpt-6-luna',
    effort: null,
    settings: {},
  } as const;
  const chat = store.aiChats.create({
    profileId,
    kind: 'chat',
    title: 'Native work',
    icon: null,
    parentId: null,
    sourceKey: null,
    engine,
  });
  const event = store.assistantEvents.add({
    id: randomUUID(),
    kind: 'chat',
    chat_id: chat.id,
    message_id: null,
    profile_id: profileId,
    client_id: owner.id,
    text: 'Open the preview',
  });
  const state = new ProviderState(store, directory, 'codex');
  const jobId = randomUUID();
  state.save(chat, {
    ...state.read(chat),
    state: 'working',
    job_id: jobId,
    session_id: 'codex-session',
  });
  const validate = providerToolValidation(
    { store, directory, runtime: 'codex' },
    state,
    { chat: { ...chat, engine }, event, jobId, executionEngine: { ...engine, settings: options } },
    () => true,
  );
  return { store, chat, engine, state, validate };
}

it('keeps the current Codex tool grant usable after a next-turn permission change', () => {
  const { store, chat, engine, validate } = running(FULL);
  store.aiChats.update(chat.id, {
    engine: { ...engine, settings: { cwd: CWD, sandbox_policy: FULL, approval_policy: 'never' } },
  });
  expect((): void => {
    validate(false);
  }).not.toThrow();
  expect((): void => {
    validate(true);
  }).not.toThrow();
});

it.each([
  [READ_ONLY, FULL],
  [FULL, READ_ONLY],
] as const)(
  'keeps project writes within both the admitted and current sandbox',
  (admitted, next) => {
    const { store, chat, engine, validate } = running(admitted);
    store.aiChats.update(chat.id, {
      engine: { ...engine, settings: { sandbox_policy: next, approval_policy: 'never' } },
    });
    expect((): void => {
      validate(false);
    }).not.toThrow();
    expect((): void => {
      validate(true);
    }).toThrow('allows reading project files only');
  },
);

it('rejects a different native execution folder and an unowned provider session', () => {
  const { store, chat, engine, state, validate } = running(FULL);
  store.aiChats.update(chat.id, { engine: { ...engine, settings: { cwd: '/different/folder' } } });
  expect((): void => {
    validate(false);
  }).toThrow('execution binding changed');
  store.aiChats.update(chat.id, { engine });
  state.save(chat, { ...state.read(chat), session_id: 'different-session' });
  expect((): void => {
    validate(false);
  }).toThrow('no longer belongs to the current turn');
});
