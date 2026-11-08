import { describe, expect, it } from 'vitest';
import {
  HARNESS_EXTENSION_PATCH,
  HARNESS_EXTENSION_SOURCE,
  HARNESS_EXTENSION_SOURCE_REQUEST,
  HARNESS_SKILL_FILES,
  sameHarnessGitOrigin,
} from '../src/ai-harness-extensions';
import { AI_HARNESS_EXTENSION_ENDPOINTS } from '../src/api/endpoints-ai-harness-extensions';
import { HARNESS_DISCOVERY_REQUEST, HARNESS_EXTENSION_INSTALL } from '../src/ai-harness-discovery';

const REFERENCE = { source: { url: 'x/y' }, snapshot: 'a'.repeat(40), id: 'skill:pdf' };

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
    expect(HARNESS_EXTENSION_INSTALL.parse({ items: [REFERENCE] }).confirm_executes).toBe(false);
  });

  it('installs only discovered references, never a bare url', () => {
    expect(HARNESS_EXTENSION_INSTALL.safeParse({ source: { url: 'x/y' } }).success).toBe(false);
    expect(
      HARNESS_EXTENSION_INSTALL.safeParse({ items: [{ ...REFERENCE, snapshot: 'main' }] }).success,
    ).toBe(false);
  });

  it('keeps a qualified offer origin and still accepts an unqualified reference', () => {
    const origin = { url: 'https://example.test/tools', ref: 'main', path: 'skills/pdf' };
    const qualified = { ...REFERENCE, origin };
    expect(HARNESS_EXTENSION_INSTALL.parse({ items: [REFERENCE, qualified] }).items).toEqual([
      REFERENCE,
      qualified,
    ]);
    expect(
      HARNESS_EXTENSION_INSTALL.safeParse({
        items: [{ ...qualified, origin: { ...origin, path: '../outside' } }],
      }).success,
    ).toBe(false);
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

it('treats Git repositories, refs and folders as separate origins', () => {
  const origin = { url: 'https://example.test/tools', ref: 'main', path: 'skills/pdf' };
  expect(sameHarnessGitOrigin(origin, { ...origin })).toBe(true);
  expect(sameHarnessGitOrigin(origin, { ...origin, url: 'https://example.test/other' })).toBe(
    false,
  );
  expect(sameHarnessGitOrigin(origin, { ...origin, ref: null })).toBe(false);
  expect(sameHarnessGitOrigin(origin, { ...origin, path: null })).toBe(false);
});

describe('browsing a source', () => {
  it('starts on the first page of twenty with no source chosen', () => {
    expect(HARNESS_DISCOVERY_REQUEST.parse({})).toMatchObject({
      page: 1,
      page_size: 20,
      query: '',
      refresh: false,
    });
  });

  it('can browse any git source', () => {
    expect(
      HARNESS_DISCOVERY_REQUEST.parse({
        kind: 'plugin',
        source: { url: 'https://x.test/a.git' },
      }).source,
    ).toEqual({ url: 'https://x.test/a.git' });
  });

  it('names plugins plugin and refuses the old extension kind', () => {
    expect(HARNESS_DISCOVERY_REQUEST.safeParse({ kind: 'extension' }).success).toBe(false);
  });
});

describe('reading a discovery page', () => {
  const response = AI_HARNESS_EXTENSION_ENDPOINTS.discoverAiHarnessExtensions.response;
  const page = {
    sources: [],
    snapshot: REFERENCE.snapshot,
    items: [],
    total: 0,
    next_page: null,
  };

  it('accepts a catalogue page without source diagnostics', () => {
    expect(response.parse(page)).toEqual({ ...page, unavailable_sources: [] });
  });

  it('preserves the Git location of each unavailable source when reported', () => {
    const unavailable = { url: 'x/y', ref: 'main', path: 'skills/pdf' };
    expect(response.parse({ ...page, unavailable_sources: [unavailable] })).toEqual({
      ...page,
      unavailable_sources: [unavailable],
    });
  });

  it('rejects malformed diagnostics instead of treating them as absent', () => {
    expect(response.safeParse({ ...page, unavailable_sources: [{ url: '' }] }).success).toBe(false);
  });
});
