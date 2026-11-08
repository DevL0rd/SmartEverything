import { describe, expect, it } from 'vitest';
import { popupDecision } from '../src/browser-popup.js';

const PUBLIC = { kind: 'public', id: 'tab', url: 'https://example.com' } as const;
const PROJECT = {
  kind: 'project',
  id: 'project',
  url: 'http://127.0.0.1:5173/',
  projectionId: 'a'.repeat(64),
  page: { chatId: '2f1c1c36-0d52-4a6e-9a43-0b6d1d7a1c11', path: '/index.html' },
} as const;

describe('links that ask for a new window', () => {
  it('opens a target=_blank link on a public page as a new tab, LAN addresses included', () => {
    expect(popupDecision(PUBLIC, 'https://example.org/docs')).toBe('open-tab');
    expect(popupDecision(PUBLIC, 'http://192.168.1.1/admin')).toBe('open-tab');
  });

  it('keeps a project page on its own origin and sends other web links to the browser', () => {
    expect(popupDecision(PROJECT, 'http://127.0.0.1:5173/next')).toBe('load-here');
    expect(popupDecision(PROJECT, 'https://docs.example.org')).toBe('open-externally');
  });

  it('refuses anything that is not a web address', () => {
    expect(popupDecision(PUBLIC, 'file:///etc/passwd')).toBe('refuse');
    expect(popupDecision(PROJECT, 'javascript:alert(1)')).toBe('refuse');
  });
});
