import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApiError } from '@smarteverything/domain';
import { chatPagePath, serveChatFile } from '../../src/browser/chat-files';

const CHAT = '00000000-0000-4000-8000-000000000001';
const OTHER = '00000000-0000-4000-8000-000000000002';
let base: string;
let server: Server;
let origin: string;
const projects = { root: (id: string): string => join(base, id) };

beforeEach(async () => {
  base = mkdtempSync(join(tmpdir(), 'se-chat-files-'));
  mkdirSync(join(base, CHAT, 'workspace', 'site'), { recursive: true });
  mkdirSync(join(base, OTHER, 'workspace'), { recursive: true });
  writeFileSync(join(base, CHAT, 'workspace', 'site', 'index.html'), '<p>one</p>');
  writeFileSync(join(base, CHAT, 'workspace', 'site', 'app.js'), 'run()');
  writeFileSync(join(base, OTHER, 'workspace', 'secret.html'), 'secret');
  symlinkSync(join(base, OTHER, 'workspace'), join(base, CHAT, 'workspace', 'away'));
  server = createServer((request, response) => {
    const raw = (request.url ?? '/').replace(/^\/files\//u, '');
    serveChatFile(projects, { request, response }, { chatId: CHAT, raw }).catch(
      (cause: unknown) => {
        response.writeHead(cause instanceof ApiError ? 403 : 500);
        response.end(cause instanceof Error ? cause.message : 'failed');
      },
    );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('The test server has no port.');
  origin = `http://127.0.0.1:${String(address.port)}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(base, { recursive: true, force: true });
});

describe('opening a chat page', () => {
  it('opens a file as it is and a folder at its index.html', async () => {
    await expect(chatPagePath(projects, CHAT, 'workspace/site/app.js')).resolves.toBe(
      '/workspace/site/app.js',
    );
    await expect(chatPagePath(projects, CHAT, '/workspace/site/')).resolves.toBe(
      '/workspace/site/index.html',
    );
  });

  it('refuses paths that leave the chat project', async () => {
    await expect(chatPagePath(projects, CHAT, 'workspace/../../x')).rejects.toThrow(
      'inside this chat’s project',
    );
    await expect(chatPagePath(projects, CHAT, 'workspace/away/secret.html')).rejects.toThrow(
      'leaves this chat’s project folder',
    );
    await expect(chatPagePath(projects, CHAT, 'workspace/none')).rejects.toThrow('There is no');
  });
});

describe('serving the chat project', () => {
  it('serves the current file with page headers and no cookies, so a reload shows edits', async () => {
    const first = await fetch(`${origin}/files/workspace/site/index.html`);
    expect(await first.text()).toBe('<p>one</p>');
    expect(first.headers.get('content-type')).toContain('text/html');
    expect(first.headers.get('cache-control')).toBe('no-store');
    expect(first.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(first.headers.get('set-cookie')).toBeNull();
    writeFileSync(join(base, CHAT, 'workspace', 'site', 'index.html'), '<p>two</p>');
    expect(await (await fetch(`${origin}/files/workspace/site/index.html`)).text()).toBe(
      '<p>two</p>',
    );
  });

  it('serves a folder index and redirects a folder without its slash', async () => {
    expect(await (await fetch(`${origin}/files/workspace/site/`)).text()).toBe('<p>one</p>');
    const bare = await fetch(`${origin}/files/workspace/site`, { redirect: 'manual' });
    expect(bare.status).toBe(307);
    expect(bare.headers.get('location')).toBe(`/api/ai/chats/${CHAT}/files/workspace/site/`);
  });

  it('refuses symlink and dot-dot escapes', async () => {
    expect((await fetch(`${origin}/files/workspace/away/secret.html`)).status).toBe(403);
    expect((await fetch(`${origin}/files/workspace/%2e%2e/%2e%2e/${OTHER}/workspace/secret.html`)).status).toBe(403);
  });
});
