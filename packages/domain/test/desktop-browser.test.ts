import { describe, expect, it } from 'vitest';
import { browsableUrl, browserAllows, publicBrowserUrl } from '../src/desktop-browser';

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
