import { describe, expect, it } from 'vitest';
import { popupDecision } from '../src/browser-popup.js';

const PUBLIC = { kind: 'public', id: 'tab', url: 'https://example.com' } as const;
const PREVIEW = {
  kind: 'preview',
  id: 'preview',
  url: 'https://app.example.net/start',
  origin: 'https://app.example.net',
  initialPath: '/',
} as const;

describe('links that ask for a new window', () => {
  it('opens a target=_blank link on a public page as a new tab, LAN addresses included', () => {
    expect(popupDecision(PUBLIC, 'https://example.org/docs')).toBe('open-tab');
    expect(popupDecision(PUBLIC, 'http://192.168.1.1/admin')).toBe('open-tab');
  });

  it('keeps a shared service on its own origin and sends other web links to the browser', () => {
    expect(popupDecision(PREVIEW, 'https://app.example.net/next')).toBe('load-here');
    expect(popupDecision(PREVIEW, 'https://docs.example.org')).toBe('open-externally');
  });

  it('refuses anything that is not a web address', () => {
    expect(popupDecision(PUBLIC, 'file:///etc/passwd')).toBe('refuse');
    expect(popupDecision(PREVIEW, 'javascript:alert(1)')).toBe('refuse');
  });
});
