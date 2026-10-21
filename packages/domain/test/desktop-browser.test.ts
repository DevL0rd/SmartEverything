import { describe, expect, it } from 'vitest';
import {
  BrowserPolicyError,
  browsableUrl,
  browserAllows,
  publicBrowserUrl,
} from '../src/desktop-browser';

const PUBLIC_TARGET = { kind: 'public', id: 'tab', url: 'https://example.com' } as const;

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
});

describe('a chat project page', () => {
  const page = { chatId: '00000000-0000-4000-8000-000000000001', path: '/workspace/site/index.html' };
  const loopback = {
    kind: 'project',
    id: 'project',
    url: 'http://127.0.0.1:4000/workspace/site/index.html',
    projectionId: 'a'.repeat(64),
    page,
  } as const;
  const desktop = { ...loopback, url: `se-preview-html://${'a'.repeat(64)}/workspace/site/` } as const;

  it('stays on its own isolated origin, without credentials', () => {
    expect(browserAllows(loopback, 'http://127.0.0.1:4000/workspace/site/app.js')).toBe(true);
    expect(browserAllows(loopback, 'http://127.0.0.1:4000/workspace/other.html')).toBe(true);
    expect(browserAllows(loopback, 'http://127.0.0.1:4001/workspace/site/')).toBe(false);
    expect(browserAllows(loopback, 'https://127.0.0.1:4000/workspace/site/')).toBe(false);
    expect(browserAllows(loopback, 'http://user:pw@127.0.0.1:4000/workspace/')).toBe(false);
    expect(browserAllows(loopback, 'https://smarteverything.devl0rd.com/api/')).toBe(false);
    expect(browserAllows(loopback, 'not a url')).toBe(false);
    expect(browserAllows(desktop, `se-preview-html://${'a'.repeat(64)}/workspace/x.html`)).toBe(true);
    expect(browserAllows(desktop, `se-preview-html://${'b'.repeat(64)}/workspace/x.html`)).toBe(false);
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
