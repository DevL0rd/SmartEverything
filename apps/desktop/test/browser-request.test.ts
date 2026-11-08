import { describe, expect, it } from 'vitest';
import type { BrowserTarget } from '@smarteverything/domain';
import { browserRequestAllowed, policyUrl } from '../src/browser-request.js';

const PUBLIC: BrowserTarget = { kind: 'public', id: 'tab', url: 'http://localhost:5173/' };
const PROJECT: BrowserTarget = {
  kind: 'project',
  id: 'project',
  url: 'http://127.0.0.1:41000/',
  projectionId: 'a'.repeat(64),
  page: {
    chatId: '00000000-0000-4000-8000-000000000001',
    path: '/',
    server: { computerId: '00000000-0000-4000-8000-000000000002', port: 5173 },
  },
};
const request = (
  url: string,
  resourceType = 'webSocket',
): { url: string; resourceType: string } => ({
  url,
  resourceType,
});

describe('browser request policy', () => {
  it('checks websockets as their http equivalents and leaves other addresses alone', () => {
    expect(policyUrl('ws://localhost:5173/ws')).toBe('http://localhost:5173/ws');
    expect(policyUrl('wss://example.com/live')).toBe('https://example.com/live');
    expect(policyUrl('https://example.com/ws://x')).toBe('https://example.com/ws://x');
    expect(policyUrl('blob:http://127.0.0.1:41000/id')).toBe('blob:http://127.0.0.1:41000/id');
  });

  it('lets a public tab open a local game socket', () => {
    expect(browserRequestAllowed(PUBLIC, request('ws://localhost:5173/ws'))).toBe(true);
    expect(browserRequestAllowed(undefined, request('ws://localhost:5173/ws'))).toBe(true);
    expect(browserRequestAllowed(PUBLIC, request('ws://user:pw@localhost:5173/ws'))).toBe(false);
    expect(browserRequestAllowed(PUBLIC, request('ftp://localhost/file', 'other'))).toBe(false);
  });

  it('keeps a project tab on its own origin for sockets', () => {
    expect(browserRequestAllowed(PROJECT, request('ws://127.0.0.1:41000/ws'))).toBe(true);
    expect(browserRequestAllowed(PROJECT, request('wss://127.0.0.1:41000/ws'))).toBe(false);
    expect(browserRequestAllowed(PROJECT, request('ws://127.0.0.1:41001/ws'))).toBe(false);
    expect(browserRequestAllowed(PROJECT, request('ws://localhost:5173/ws'))).toBe(false);
    expect(browserRequestAllowed(PROJECT, request('ws://192.168.1.5:5173/ws'))).toBe(false);
  });

  it('keeps project pages from navigating away while allowing public scripts and inline data', () => {
    expect(browserRequestAllowed(PROJECT, request('https://cdn.example.com/a.js', 'script'))).toBe(
      true,
    );
    expect(browserRequestAllowed(PROJECT, request('https://example.com/', 'mainFrame'))).toBe(
      false,
    );
    expect(browserRequestAllowed(PROJECT, request('data:text/plain,hi', 'image'))).toBe(true);
  });
});
