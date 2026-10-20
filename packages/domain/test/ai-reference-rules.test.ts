import { describe, expect, it } from 'vitest';
import {
  AI_MESSAGE_REFERENCE,
  AI_REFERENCE,
  AI_REFERENCE_DIRECTORY,
  AI_REFERENCE_SEARCH,
  AI_REFERENCE_SOURCE_STATUS,
  referencesMatchText,
  type AiMessageReference,
} from '../src/ai-references';

const CHAT = '3a000000-0000-4000-8000-0000000000a1';
const DEVICE = '3a000000-0000-4000-8000-0000000000b1';

const MANAGED = {
  kind: 'managed_path',
  chat_id: CHAT,
  path: 'workspace/notes.md',
  entry_kind: 'file',
  version: 'v1',
} as const;

const DEVICE_PATH = {
  kind: 'device_path',
  target: { kind: 'device', device_id: DEVICE },
  workspace_root: '/home/me/project',
  path: 'src/index.ts',
  entry_kind: 'file',
  version: 'v1',
} as const;

function message(start: number, token: string): AiMessageReference {
  return AI_MESSAGE_REFERENCE.parse({
    reference: { kind: 'chat', chat_id: CHAT },
    label: token,
    token,
    start,
    end: start + token.length,
  });
}

describe('references to files', () => {
  it('refuses to reference an operation receipt in a managed project', () => {
    expect(AI_REFERENCE.safeParse(MANAGED).success).toBe(true);
    expect(
      AI_REFERENCE.safeParse({ ...MANAGED, path: 'workspace/.operations/receipt.json' }).success,
    ).toBe(false);
  });

  it.each(['src/index.ts', 'a'])('accepts the device path %s', (path) => {
    expect(AI_REFERENCE.safeParse({ ...DEVICE_PATH, path }).success).toBe(true);
  });

  it.each(['/etc/passwd', 'a/../b', 'a//b', './a', 'a\\b', 'a\0b', ''])(
    'refuses the device path %j',
    (path) => {
      expect(AI_REFERENCE.safeParse({ ...DEVICE_PATH, path }).success).toBe(false);
    },
  );

  it('takes only directories as containers', () => {
    expect(AI_REFERENCE_DIRECTORY.safeParse({ ...MANAGED, entry_kind: 'directory' }).success).toBe(
      true,
    );
    expect(AI_REFERENCE_DIRECTORY.safeParse(MANAGED).success).toBe(false);
  });
});

describe('message references', () => {
  it('needs the span to be exactly as long as the token', () => {
    const base = { reference: { kind: 'chat', chat_id: CHAT }, label: 'Chat', token: '@chat' };
    expect(AI_MESSAGE_REFERENCE.safeParse({ ...base, start: 0, end: 5 }).success).toBe(true);
    expect(AI_MESSAGE_REFERENCE.safeParse({ ...base, start: 0, end: 6 }).success).toBe(false);
  });

  it('matches text only when every token sits at its span and spans do not overlap', () => {
    const first = message(0, '@one');
    const second = message(5, '@two');
    expect(referencesMatchText('@one @two', [second, first])).toBe(true);
    expect(referencesMatchText('@one @tow', [first, second])).toBe(false);
    expect(referencesMatchText('@one', [])).toBe(true);
  });

  it('refuses spans that overlap even when each token matches its own span', () => {
    const outer = message(0, '@a@b');
    const inner = message(2, '@b');
    expect(referencesMatchText('@a@b', [outer, inner])).toBe(false);
  });
});

describe('reference search', () => {
  it('fills the query and limit', () => {
    expect(AI_REFERENCE_SEARCH.parse({})).toMatchObject({ query: '', limit: 20 });
  });

  it('refuses a directory together with a container', () => {
    const container = { ...MANAGED, entry_kind: 'directory' };
    expect(AI_REFERENCE_SEARCH.safeParse({ container, directory: 'workspace' }).success).toBe(
      false,
    );
    expect(AI_REFERENCE_SEARCH.safeParse({ container }).success).toBe(true);
    expect(AI_REFERENCE_SEARCH.safeParse({ directory: 'workspace' }).success).toBe(true);
  });

  it('refuses to search operation receipts and repeated kinds', () => {
    expect(AI_REFERENCE_SEARCH.safeParse({ directory: 'workspace/.operations' }).success).toBe(
      false,
    );
    expect(AI_REFERENCE_SEARCH.safeParse({ kinds: ['skill', 'skill'] }).success).toBe(false);
    expect(AI_REFERENCE_SEARCH.safeParse({ kinds: ['skill', 'chat'] }).success).toBe(true);
  });

  it('makes an unavailable source explain why', () => {
    expect(
      AI_REFERENCE_SOURCE_STATUS.safeParse({ kind: 'skill', state: 'available' }).success,
    ).toBe(true);
    expect(
      AI_REFERENCE_SOURCE_STATUS.safeParse({ kind: 'skill', state: 'unavailable' }).success,
    ).toBe(false);
    expect(
      AI_REFERENCE_SOURCE_STATUS.safeParse({
        kind: 'skill',
        state: 'unavailable',
        reason: 'offline',
      }).success,
    ).toBe(true);
  });
});
