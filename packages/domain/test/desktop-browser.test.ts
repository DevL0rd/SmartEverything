import { describe, expect, it } from 'vitest';
import {
  BrowserPolicyError,
  browsableUrl,
  browserAllows,
  publicBrowserUrl,
} from '../src/desktop-browser';

const PUBLIC_TARGET = { kind: 'public', id: 'tab', url: 'https://example.com' } as const;
const PREVIEW_TARGET = {
  kind: 'preview',
  id: 'preview',
  url: 'https://preview.example.net/start',
  origin: 'https://preview.example.net',
  initialPath: '/',
} as const;

describe('public browser addresses', () => {
  it.each(['https://example.com/page?q=1', 'http://example.com/page', 'http://news.example.org'])(
    'accepts the public web address %s for the AI and the user',
    (address) => {
      expect(publicBrowserUrl(address)).toBe(true);
      expect(browserAllows(PUBLIC_TARGET, address)).toBe(true);
    },
  );

  it.each([
    'http://localhost:3000',
    'http://192.168.1.1/admin',
    'http://router.local',
    'http://printer.home',
    'http://[::1]/',
  ])('refuses the local address %s to the AI but opens it for the user', (address) => {
    expect(publicBrowserUrl(address)).toBe(false);
    expect(browsableUrl(address)).toBe(true);
    expect(browserAllows(PUBLIC_TARGET, address)).toBe(true);
  });

  it.each([
    'http://user:secret@example.com',
    'http://user:secret@192.168.1.1',
    'ftp://example.com/file',
    'javascript:alert(1)',
    'not a url',
  ])('refuses the credentialed or non-web address %s for everyone', (address) => {
    expect(publicBrowserUrl(address)).toBe(false);
    expect(browsableUrl(address)).toBe(false);
    expect(browserAllows(PUBLIC_TARGET, address)).toBe(false);
  });

  it('keeps a preview page on its own https origin', () => {
    expect(browserAllows(PREVIEW_TARGET, 'https://preview.example.net/other')).toBe(true);
    expect(browserAllows(PREVIEW_TARGET, 'http://preview.example.net/other')).toBe(false);
    expect(browserAllows(PREVIEW_TARGET, 'https://elsewhere.example.net/')).toBe(false);
  });
});

describe('a native html page', () => {
  const PAGE = `se-preview-html://${'a'.repeat(64)}/`;
  const single = {
    kind: 'native-html',
    id: 'page',
    url: PAGE,
    projectionId: 'a'.repeat(64),
  } as const;
  const project = {
    kind: 'native-html',
    id: 'project',
    url: 'http://127.0.0.1:4000/site/',
    projectionId: 'a'.repeat(64),
    project: true,
  } as const;

  it('allows a single page only at its own address, ignoring the fragment', () => {
    expect(browserAllows(single, PAGE)).toBe(true);
    expect(browserAllows(single, `${PAGE}#top`)).toBe(true);
    expect(browserAllows(single, `${PAGE}other`)).toBe(false);
    expect(browserAllows(single, 'https://example.com/')).toBe(false);
    expect(browserAllows(single, 'not a url')).toBe(false);
  });

  it('allows a project anywhere on its own scheme and host, without credentials', () => {
    expect(browserAllows(project, 'http://127.0.0.1:4000/site/app.js')).toBe(true);
    expect(browserAllows(project, 'http://127.0.0.1:4000/other')).toBe(true);
    expect(browserAllows(project, 'http://127.0.0.1:4001/site/')).toBe(false);
    expect(browserAllows(project, 'https://127.0.0.1:4000/site/')).toBe(false);
    expect(browserAllows(project, 'http://user:pw@127.0.0.1:4000/site/')).toBe(false);
    expect(browserAllows(project, 'not a url')).toBe(false);
  });

  it('refuses a preview address that is not a url', () => {
    expect(browserAllows(PREVIEW_TARGET, 'not a url')).toBe(false);
  });
});

describe('BrowserPolicyError', () => {
  it('keeps the reason as its message and a field', () => {
    const error = new BrowserPolicyError('no private hosts');
    expect(error.name).toBe('BrowserPolicyError');
    expect(error.message).toBe('no private hosts');
    expect(error.reason).toBe('no private hosts');
  });
});
