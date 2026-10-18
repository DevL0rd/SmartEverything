import { describe, expect, it } from 'vitest';
import {
  HARNESS_EXTENSION_INSTALL,
  HARNESS_EXTENSION_PATCH,
  HARNESS_EXTENSION_SOURCE,
  HARNESS_EXTENSION_SOURCE_REQUEST,
  HARNESS_SKILL_FILES,
} from '../src/ai-harness-extensions';
import { AI_HARNESS_EXTENSION_ENDPOINTS } from '../src/api/endpoints-ai-harness-extensions';
import { HARNESS_DISCOVERY_REQUEST } from '../src/ai-harness-discovery';

describe('the folder a skill or plugin is read from', () => {
  it.each(['skills/pdf', 'plugins/tools/skills/a', 'pdf'])('accepts %s', (path) => {
    expect(HARNESS_EXTENSION_SOURCE_REQUEST.safeParse({ url: 'x/y', path }).success).toBe(true);
  });

  it.each(['../up', 'a/../b', 'a//b', '/abs', 'a\\b', './a', 'a\0b', ''])(
    'refuses %j because it leaves the repository folder',
    (path) => {
      expect(HARNESS_EXTENSION_SOURCE_REQUEST.safeParse({ url: 'x/y', path }).success).toBe(false);
    },
  );
});

describe('the name of a skill written in the app', () => {
  it.each(['..', '.', '../store', 'a/b', '.hidden', ''])('refuses %j', (name) => {
    expect(
      AI_HARNESS_EXTENSION_ENDPOINTS.writeAiHarnessSkill.params.safeParse({ name }).success,
    ).toBe(false);
  });

  it('accepts an ordinary folder name', () => {
    expect(
      AI_HARNESS_EXTENSION_ENDPOINTS.writeAiHarnessSkill.params.safeParse({ name: 'my-skill.v2' })
        .success,
    ).toBe(true);
  });
});

describe('a skill written in the app', () => {
  it('needs a SKILL.md next to its resource files', () => {
    const files = [{ path: 'notes/extra.md', content: 'x' }];

    expect(HARNESS_SKILL_FILES.safeParse({ files }).success).toBe(false);
    expect(
      HARNESS_SKILL_FILES.safeParse({ files: [...files, { path: 'SKILL.md', content: 'y' }] })
        .success,
    ).toBe(true);
    expect(HARNESS_SKILL_FILES.safeParse({ files: [] }).success).toBe(false);
  });
});

describe('installing and changing', () => {
  it('does not confirm hooks or MCP servers unless asked', () => {
    expect(HARNESS_EXTENSION_INSTALL.parse({ source: { url: 'x/y' } }).confirm_executes).toBe(
      false,
    );
  });

  it('changes only the fields it names and refuses unknown ones', () => {
    expect(HARNESS_EXTENSION_PATCH.parse({ enabled: false })).toEqual({ enabled: false });
    expect(HARNESS_EXTENSION_PATCH.safeParse({ revision: 'x' }).success).toBe(false);
  });

  it('describes where an item came from as included, git or editor', () => {
    expect(HARNESS_EXTENSION_SOURCE.parse({ kind: 'included' })).toEqual({ kind: 'included' });
    expect(
      HARNESS_EXTENSION_SOURCE.safeParse({
        kind: 'git',
        url: 'x/y',
        ref: null,
        path: null,
        commit: 'not-a-commit',
      }).success,
    ).toBe(false);
  });
});

describe('browsing a source', () => {
  it('starts on the first page of twenty with no source chosen', () => {
    expect(HARNESS_DISCOVERY_REQUEST.parse({ kind: 'skill' })).toMatchObject({
      page: 1,
      page_size: 20,
      query: '',
      refresh: false,
    });
  });

  it('can browse any git source', () => {
    expect(
      HARNESS_DISCOVERY_REQUEST.parse({
        kind: 'extension',
        source: { url: 'https://x.test/a.git' },
      }).source,
    ).toEqual({ url: 'https://x.test/a.git' });
  });
});
