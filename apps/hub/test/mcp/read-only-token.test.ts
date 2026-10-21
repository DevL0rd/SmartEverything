import { API_ENDPOINTS, MCP_TOOLS } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { LAMP } from '../support/fake-provider';
import { bootServer, linkFakeProvider, verifiedPublicUrl, type Booted } from '../support/booted';
import { captureLogs } from '../support/logs';
import { call, temporaryDirectory } from '../support/server';
import { callTool, resultOf, rpc } from './client';

let directory: { path: string; remove: () => Promise<void> };
let booted: Booted;
let token: string;
let lamp: string;

const LISTED = z.object({ tools: z.array(z.object({ name: z.string() })) });

beforeEach(async () => {
  captureLogs();
  directory = await temporaryDirectory();
  booted = await bootServer(directory.path);
  await verifiedPublicUrl(booted);
  await linkFakeProvider(booted);
  const created = await call(booted.base, booted.owner, {
    method: 'POST',
    path: '/api/mcp/tokens',
    body: { name: 'Reader', access: 'read' },
  });
  const issued = API_ENDPOINTS.createMcpToken.response.parse(created.body);
  expect(issued.row.access).toBe('read');
  token = issued.token;
  const devices = API_ENDPOINTS.listDevices.response.parse(
    (await call(booted.base, booted.owner, { method: 'GET', path: '/api/devices' })).body,
  );
  lamp = devices.find((device) => device.external_id === LAMP.externalId)?.id ?? '';
});

afterEach(async () => {
  await booted.server.stop();
  await directory.remove();
});

describe('a read-only connection', () => {
  it('lists only the tools that read', async () => {
    const listed = LISTED.parse(
      await resultOf(await rpc(booted.base, token, { method: 'tools/list' })),
    );
    const reads: ReadonlySet<string> = new Set(
      MCP_TOOLS.filter((tool) => tool.access === 'read').map((tool) => tool.name),
    );
    expect(listed.tools.length).toBeGreaterThan(0);
    expect(listed.tools.every((tool) => reads.has(tool.name))).toBe(true);
  });

  it('reads the home and is refused, on the server, any change', async () => {
    expect((await callTool(booted.base, token, 'device_read', { deviceId: lamp })).isError).toBe(
      false,
    );
    const refused = await callTool(booted.base, token, 'device_control', {
      deviceIds: [lamp], capability: 'power', value: false,
    });
    expect(refused.isError).toBe(true);
    expect(JSON.stringify(refused.content)).toContain('This connection is read only');
  });
});
