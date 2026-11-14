import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { API_ENDPOINTS } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hubLayout } from '../../src/data-layout';
import { bootServer, verifiedPublicUrl, type Booted } from '../support/booted';
import { captureLogs } from '../support/logs';
import { call, temporaryDirectory } from '../support/server';
import { callTool, structured } from './client';

let directory: { path: string; remove: () => Promise<void> };
let booted: Booted;
let token: string;

async function issue(access?: 'read'): Promise<string> {
  const created = await call(booted.base, booted.owner, {
    method: 'POST',
    path: '/api/mcp/tokens',
    body: { name: 'Claude Code', ...(access === undefined ? {} : { access }) },
  });
  return API_ENDPOINTS.createMcpToken.response.parse(created.body).token;
}

beforeEach(async () => {
  captureLogs();
  directory = await temporaryDirectory();
  booted = await bootServer(directory.path);
  await verifiedPublicUrl(booted);
  token = await issue();
});

afterEach(async () => {
  await booted.server.stop();
  await directory.remove();
});

describe('the update tools over an owner MCP connection', () => {
  it('reads the latest hub release', async () => {
    expect(
      structured(await callTool(booted.base, token, 'update_control', { action: 'status' })),
    ).toEqual({
      release: null,
    });
  });

  it('passes the owner gate and reaches the update source check for a hub release', async () => {
    const result = await callTool(booted.base, token, 'update_control', {
      action: 'hub',
      notes: 'Remote release',
    });
    expect(result.isError).toBe(true);
    const text = JSON.stringify(result.content);
    expect(text).toContain('unavailable');
    expect(text).not.toContain('forbidden');
  });

  it('refuses a release to a read-only connection but lets it read status', async () => {
    const reader = await issue('read');
    const refused = await callTool(booted.base, reader, 'update_control', {
      action: 'hub',
      notes: 'Remote release',
    });
    expect(refused.isError).toBe(true);
    expect(JSON.stringify(refused.content)).toContain('This connection is read only');
    expect(
      structured(await callTool(booted.base, reader, 'update_control', { action: 'status' })),
    ).toEqual({ release: null });
  });

  it('claims repair work for the owner’s conversation chat', async () => {
    const claimed = structured(
      await callTool(booted.base, token, 'repair_claim', { component: 'hub.service' }),
    );
    const conversation = API_ENDPOINTS.openConversationChat.response.parse(
      (
        await call(booted.base, booted.owner, {
          method: 'POST',
          path: '/api/ai/chats/conversation',
        })
      ).body,
    );
    expect(claimed).toMatchObject({ component: 'hub.service', chatId: conversation.id });
  });

  it('delivers a staged file into the owner’s conversation chat', async () => {
    const artifacts = join(hubLayout(directory.path, {}).system.updates.selfUpdate, 'artifacts');
    await mkdir(artifacts, { recursive: true });
    const path = join(artifacts, 'build.apk');
    await writeFile(path, 'apk');
    const sent = structured(
      await callTool(booted.base, token, 'chat_file_send', { path, what: 'A verified build' }),
    );
    expect(sent['status']).toBe('File already delivered as an attachment in the chat.');
  });
});
