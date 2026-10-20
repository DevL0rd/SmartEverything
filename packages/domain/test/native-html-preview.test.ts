import { describe, expect, it } from 'vitest';
import {
  NATIVE_HTML_CLAIM,
  NATIVE_HTML_OPEN,
  NATIVE_HTML_PROJECTION,
  NATIVE_PAGE_DESCRIPTOR,
  NATIVE_PREVIEW_DOCUMENT,
  chatPageAssetUrl,
} from '../src/native-html-preview';

const CHAT = '3a000000-0000-4000-8000-0000000000a1';
const PUBLICATION = '3a000000-0000-4000-8000-0000000000b1';
const PROFILE = '3a000000-0000-4000-8000-0000000000c1';
const ID = 'a'.repeat(64);
const OTHER_ID = 'b'.repeat(64);

function descriptor(entryPath: string): unknown {
  return { version: 2, chatId: CHAT, publicationId: PUBLICATION, profileId: PROFILE, entryPath };
}

describe('NATIVE_PAGE_DESCRIPTOR entry path', () => {
  it.each(['/', '/index.html', '/a/b.html', '/a%20b.html'])('accepts %s', (path) => {
    expect(NATIVE_PAGE_DESCRIPTOR.safeParse(descriptor(path)).success).toBe(true);
  });

  it.each([
    'index.html',
    '//evil.example/x',
    '/a\\b',
    '/a%00b',
    '/a%2fb',
    '/a%5Cb',
    '/a%25b',
    '/a%zzb',
    '/../a',
    '/a/../b',
    '/a b',
    '/a?x=1',
  ])('refuses %s', (path) => {
    expect(NATIVE_PAGE_DESCRIPTOR.safeParse(descriptor(path)).success).toBe(false);
  });
});

describe('chatPageAssetUrl', () => {
  it('encodes the chat and publication and appends the asset path', () => {
    expect(chatPageAssetUrl('a b', 'c/d', '/x.js')).toBe('/api/ai/chats/a%20b/pages/c%2Fd/x.js');
  });
});

describe('NATIVE_HTML_PROJECTION', () => {
  const custom = { id: ID, url: `se-preview-html://${ID}/`, expiresAt: null };
  const loopback = { id: ID, url: `http://127.0.0.1:4000/${ID}/`, expiresAt: null };

  it('accepts the custom scheme whose host is the id and the loopback path of the id', () => {
    expect(NATIVE_HTML_PROJECTION.safeParse(custom).success).toBe(true);
    expect(NATIVE_HTML_PROJECTION.safeParse(loopback).success).toBe(true);
  });

  it('refuses a presentation address that names another id', () => {
    expect(
      NATIVE_HTML_PROJECTION.safeParse({ ...custom, url: `se-preview-html://${OTHER_ID}/` })
        .success,
    ).toBe(false);
    expect(
      NATIVE_HTML_PROJECTION.safeParse({ ...loopback, url: `http://127.0.0.1:4000/${OTHER_ID}/` })
        .success,
    ).toBe(false);
  });

  it('refuses a custom address with a path, or a scheme and host it does not own', () => {
    expect(
      NATIVE_HTML_PROJECTION.safeParse({ ...custom, url: `se-preview-html://${ID}/deeper` })
        .success,
    ).toBe(false);
    expect(
      NATIVE_HTML_PROJECTION.safeParse({ ...loopback, url: `http://localhost:4000/${ID}/` })
        .success,
    ).toBe(false);
    expect(
      NATIVE_HTML_PROJECTION.safeParse({ ...loopback, url: `http://127.0.0.1/${ID}/` }).success,
    ).toBe(false);
    expect(
      NATIVE_HTML_PROJECTION.safeParse({ ...loopback, url: `https://127.0.0.1:4000/${ID}/` })
        .success,
    ).toBe(false);
  });

  it.each([`?a=1`, `#frag`])('refuses an address carrying %s', (suffix) => {
    expect(
      NATIVE_HTML_PROJECTION.safeParse({ ...custom, url: `se-preview-html://${ID}/${suffix}` })
        .success,
    ).toBe(false);
  });

  it('refuses credentials in the address', () => {
    expect(
      NATIVE_HTML_PROJECTION.safeParse({
        ...loopback,
        url: `http://user:pw@127.0.0.1:4000/${ID}/`,
      }).success,
    ).toBe(false);
  });

  it('lets a project projection use any exact path', () => {
    expect(
      NATIVE_HTML_PROJECTION.safeParse({
        id: ID,
        project: true,
        url: `se-preview-html://${OTHER_ID}/`,
        expiresAt: null,
      }).success,
    ).toBe(true);
    expect(
      NATIVE_HTML_PROJECTION.safeParse({
        id: ID,
        project: true,
        url: 'http://127.0.0.1:4000/site/',
        expiresAt: null,
      }).success,
    ).toBe(true);
  });
});

describe('NATIVE_HTML_OPEN', () => {
  it('reads the page form with a credential binding and refuses the page form without one', () => {
    expect(
      NATIVE_HTML_OPEN.safeParse({ scopeId: 's', authorization: 'a', page: descriptor('/') })
        .success,
    ).toBe(false);
  });
});

describe('native preview documents', () => {
  it('tells an html document from a project document by its fields', () => {
    const common = {
      publicationId: PUBLICATION,
      revision: CHAT,
      profileId: PROFILE,
      expiresAt: null,
    };
    expect(NATIVE_PREVIEW_DOCUMENT.safeParse({ ...common, html: '<p>x</p>' }).success).toBe(true);
    expect(
      NATIVE_PREVIEW_DOCUMENT.safeParse({
        ...common,
        kind: 'project',
        leaseId: ID,
        assetToken: OTHER_ID,
        entryPath: '/index.html',
      }).success,
    ).toBe(true);
    expect(
      NATIVE_PREVIEW_DOCUMENT.safeParse({ ...common, kind: 'project', leaseId: ID }).success,
    ).toBe(false);
  });

  it('claims a lease only for a known capability', () => {
    expect(
      NATIVE_HTML_CLAIM.safeParse({ chatId: CHAT, capability: 'other', lease: {} }).success,
    ).toBe(false);
  });
});
